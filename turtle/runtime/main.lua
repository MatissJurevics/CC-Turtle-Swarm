package.path = "/fleet/runtime/?.lua;" .. package.path

local config_loader = require("config")
local logger = require("logger").new("main")
local spool = require("spool")
local actuator = require("actuator")

local cfg, err = config_loader.load("/fleet/config.lua")
if not cfg then
  error("config error: " .. tostring(err))
end

local runtime = {
  config = cfg,
  events = spool.new("/fleet/events.spool"),
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

  return {
    turtle_id = self.config.turtle_id,
    computer_id = os.getComputerID(),
    label = os.getComputerLabel(),
    fuel = turtle.getFuelLevel(),
    fuel_limit = turtle.getFuelLimit(),
    selected_slot = turtle.getSelectedSlot(),
    inventory = inventory,
    runtime_version = self.config.runtime_version
  }
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

logger:info("fleet runtime starting", {
  turtle_id = cfg.turtle_id,
  fleet_url = cfg.fleet_url,
  runtime_version = cfg.runtime_version
})

runtime:emit("event.turtle.booted", runtime:observe())

while true do
  runtime:emit("event.turtle.heartbeat", runtime:observe())
  sleep(10)
end

