package.path = "/fleet/runtime/?.lua;" .. package.path

local config_loader = require("config")
local logger = require("logger").new("main")
local spool = require("spool")
local actuator = require("actuator")
local transport = require("transport")
local executor = require("executor")
local watchdog = require("watchdog")
local odometry = require("odometry")
local scanner = require("scanner")

local cfg, err = config_loader.load("/fleet/config.lua")
if not cfg then
  error("config error: " .. tostring(err))
end

local runtime = {
  config = cfg,
  events = spool.new("/fleet/events.spool"),
  odometry = odometry.new(cfg),
  seq = 0
}

function runtime:next_event_id()
  self.seq = self.seq + 1
  return self.config.turtle_id .. "-" .. tostring(os.epoch("utc")) .. "-" .. tostring(self.seq)
end

function runtime:observe()
  local inventory = {}
  for slot = 1, 16 do
    local detail = turtle.getItemDetail(slot)
    inventory[slot] = detail and {
      name = detail.name,
      count = detail.count
    } or nil
  end

  local pose = self.odometry:snapshot()
  return {
    turtle_id = self.config.turtle_id,
    computer_id = os.getComputerID(),
    label = os.getComputerLabel(),
    position = pose.position,
    facing = pose.facing,
    dimension = pose.dimension,
    position_confidence = pose.confidence,
    fuel = turtle.getFuelLevel(),
    fuel_limit = turtle.getFuelLimit(),
    selected_slot = turtle.getSelectedSlot(),
    inventory = inventory,
    runtime_version = self.config.runtime_version
  }
end

function runtime:after_action(action, success)
  if success then
    self.odometry:after_success(action)
  end
end

function runtime:emit(event_type, body)
  local event = {
    event_id = self:next_event_id(),
    type = event_type,
    turtle_id = self.config.turtle_id,
    seq = self.seq,
    created_at = os.epoch("utc"),
    body = body or {}
  }
  self.events:append(event)
  return event
end

local rt_actuator = actuator.new(runtime)
local rt_executor = executor.new(runtime, rt_actuator)
local rt_transport = transport.new(cfg, logger)
local rt_scanner = scanner.new(runtime)

local function send_spool()
  local events = runtime.events:all()
  if #events == 0 then
    return
  end
  rt_transport:send({
    type = "event.spool",
    events = events
  })
end

local function preconditions_ok(preconditions)
  if not preconditions then
    return true
  end
  local observed = runtime:observe()
  if preconditions.min_fuel and type(observed.fuel) == "number" and observed.fuel < preconditions.min_fuel then
    return false, { code = "fuel_below_minimum", message = "Fuel below command precondition" }
  end
  if preconditions.expected_position and observed.position then
    for index = 1, 3 do
      if observed.position[index] ~= preconditions.expected_position[index] then
        return false, { code = "position_precondition_failed", message = "Position does not match precondition" }
      end
    end
  end
  if preconditions.expected_facing and observed.facing and observed.facing ~= preconditions.expected_facing then
    return false, { code = "facing_precondition_failed", message = "Facing does not match precondition" }
  end
  return true
end

local function complete_rejected(command, error_body)
  runtime:emit("event.action.completed", {
    command_id = command.commandId or command.command_id,
    action = command.body and command.body.action or "unknown",
    success = false,
    error = error_body,
    before = runtime:observe(),
    after = runtime:observe()
  })
end

local function run_command(command)
  if not command or command.kind ~= "turtle.action" then
    return
  end
  local command_id = command.commandId or command.command_id
  local body = command.body or {}
  local deadline = watchdog.deadline(body.timeout_ms or body.timeoutMs)
  if watchdog.expired(deadline) then
    complete_rejected(command, { code = "command_timeout", message = "Command expired before execution" })
    return
  end
  local ok, precondition_error = preconditions_ok(body.preconditions)
  if not ok then
    complete_rejected(command, precondition_error)
    return
  end
  if body.action == "script.run" then
    local script_id = body.args and body.args[1]
    local success, result = rt_executor:run(script_id, body.args and body.args[2] or {})
    runtime:emit("event.action.completed", {
      command_id = command_id,
      action = "script.run",
      success = success,
      result = success and result or nil,
      error = success and nil or result,
      before = runtime:observe(),
      after = runtime:observe()
    })
    return
  end
  rt_actuator:run(body.action, body.args or {}, {
    command_id = command_id,
    lease_id = body.leaseId or body.lease_id,
    mode = "queued"
  })
end

logger:info("fleet runtime starting", {
  turtle_id = cfg.turtle_id,
  fleet_url = cfg.fleet_url,
  runtime_version = cfg.runtime_version
})

runtime:emit("event.turtle.booted", runtime:observe())

while true do
  if rt_transport:connect() then
    runtime:emit("event.turtle.heartbeat", runtime:observe())
    runtime.odometry:reconcile_gps(0.5)
    if rt_scanner:due() then
      runtime:emit("event.world.scanned", rt_scanner:scan())
    end
    send_spool()
    rt_transport:send({ type = "command.next" })
    local message = rt_transport:receive(1)
    if message and message.type == "ack" then
      runtime.events:ack_many(message.event_ids)
    elseif message and message.type == "command.request" then
      run_command(message.body)
      send_spool()
    elseif message and message.type == "event.gateway.ready" then
      logger:info("gateway ready", { turtle_id = cfg.turtle_id })
    elseif message and message.type == "error" then
      logger:error("gateway error", { reason = message.reason })
    end
  end
  sleep(2)
end
