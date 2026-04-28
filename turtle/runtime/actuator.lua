local actuator = {}

local actions = {
  forward = turtle.forward,
  back = turtle.back,
  up = turtle.up,
  down = turtle.down,
  turnLeft = turtle.turnLeft,
  turnRight = turtle.turnRight,
  dig = turtle.dig,
  digUp = turtle.digUp,
  digDown = turtle.digDown,
  place = turtle.place,
  placeUp = turtle.placeUp,
  placeDown = turtle.placeDown,
  inspect = turtle.inspect,
  inspectUp = turtle.inspectUp,
  inspectDown = turtle.inspectDown
}

function actuator.new(runtime)
  local instance = {
    runtime = runtime
  }

  function instance:run(action, args, context)
    local fn = actions[action]
    if not fn then
      return false, { code = "unknown_action", message = action }
    end

    local before = self.runtime:observe()
    self.runtime:emit("event.action.started", {
      command_id = context and context.command_id or nil,
      action = action,
      context = context or {},
      before = before
    })

    local result = table.pack(fn(table.unpack(args or {})))
    local success = result[1] == true
    local after = self.runtime:observe()
    local body = {
      command_id = context and context.command_id or nil,
      action = action,
      success = success,
      before = before,
      after = after
    }

    if success then
      body.result = { table.unpack(result, 2, result.n) }
    else
      body.error = {
        code = "action_failed",
        message = tostring(result[2] or "unknown failure")
      }
    end

    self.runtime:emit("event.action.completed", body)
    return success, body
  end

  return instance
end

return actuator
