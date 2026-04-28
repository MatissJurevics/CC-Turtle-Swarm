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

local function clone_position(position)
  if not position then
    return nil
  end
  return { position[1], position[2], position[3] }
end

local function front_cell(origin)
  if not origin or not origin.position then
    return nil
  end
  local x, y, z = origin.position[1], origin.position[2], origin.position[3]
  if origin.facing == "north" then
    z = z - 1
  elseif origin.facing == "south" then
    z = z + 1
  elseif origin.facing == "east" then
    x = x + 1
  elseif origin.facing == "west" then
    x = x - 1
  end
  return { dimension = origin.dimension or "overworld", x = x, y = y, z = z }
end

local function observed_cell(origin, action)
  if not origin or not origin.position then
    return nil
  end
  if action == "inspectUp" then
    return { dimension = origin.dimension or "overworld", x = origin.position[1], y = origin.position[2] + 1, z = origin.position[3] }
  end
  if action == "inspectDown" then
    return { dimension = origin.dimension or "overworld", x = origin.position[1], y = origin.position[2] - 1, z = origin.position[3] }
  end
  return front_cell(origin)
end

local function inspect_direction(action)
  if action == "inspectUp" then
    return "up"
  end
  if action == "inspectDown" then
    return "down"
  end
  return "front"
end

local function block_from_detail(detail)
  if not detail then
    return nil
  end
  return {
    name = detail.name,
    state = detail.state or {},
    tags = detail.tags or {}
  }
end

local function inspect_observation(action, before, success, result)
  if action ~= "inspect" and action ~= "inspectUp" and action ~= "inspectDown" then
    return nil
  end
  local observation = {
    direction = inspect_direction(action),
    cell = observed_cell(before, action),
    observed_from = {
      position = clone_position(before.position),
      facing = before.facing,
      dimension = before.dimension,
      confidence = before.position_confidence
    },
    success = success
  }
  if success then
    observation.block = block_from_detail(result)
    return observation
  end
  local message = tostring(result or "unknown")
  observation.error = {
    code = message:lower():find("no block") and "no_block" or "inspect_failed",
    message = message
  }
  if observation.error.code == "no_block" then
    observation.success = true
    observation.occupancy = "air"
    observation.block = { name = "minecraft:air", state = {}, tags = {} }
  end
  return observation
end

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
    self.runtime:after_action(action, success)
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

    local observation = inspect_observation(action, before, success, result[2])
    if observation then
      body.observations = { observation }
    end

    self.runtime:emit("event.action.completed", body)
    return success, body
  end

  return instance
end

return actuator
