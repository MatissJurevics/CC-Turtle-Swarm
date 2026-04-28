local odometry = {}

local headings = { "north", "east", "south", "west" }

local function heading_index(facing)
  for index, value in ipairs(headings) do
    if value == facing then
      return index
    end
  end
  return 1
end

local function clone_position(position)
  if not position then
    return nil
  end
  return { position[1], position[2], position[3] }
end

function odometry.new(config)
  local instance = {
    position = clone_position(config.initial_position),
    facing = config.initial_facing or "north",
    dimension = config.dimension or "overworld",
    confidence = config.initial_position and 0.75 or 0
  }

  function instance:snapshot()
    return {
      position = clone_position(self.position),
      facing = self.facing,
      dimension = self.dimension,
      confidence = self.confidence
    }
  end

  function instance:after_success(action)
    if action == "turnLeft" then
      self.facing = headings[((heading_index(self.facing) - 2) % #headings) + 1]
      return
    end
    if action == "turnRight" then
      self.facing = headings[(heading_index(self.facing) % #headings) + 1]
      return
    end
    if not self.position then
      return
    end
    local delta = { 0, 0, 0 }
    if action == "up" then
      delta[2] = 1
    elseif action == "down" then
      delta[2] = -1
    elseif action == "forward" or action == "back" then
      local sign = action == "forward" and 1 or -1
      if self.facing == "north" then
        delta[3] = -1 * sign
      elseif self.facing == "south" then
        delta[3] = 1 * sign
      elseif self.facing == "east" then
        delta[1] = 1 * sign
      elseif self.facing == "west" then
        delta[1] = -1 * sign
      end
    else
      return
    end
    self.position[1] = self.position[1] + delta[1]
    self.position[2] = self.position[2] + delta[2]
    self.position[3] = self.position[3] + delta[3]
    self.confidence = math.max(0.1, self.confidence - 0.005)
  end

  function instance:reconcile_gps(timeout)
    if not gps or not gps.locate then
      return false, "gps_unavailable"
    end
    local x, y, z = gps.locate(timeout or 2)
    if not x then
      return false, "gps_unavailable"
    end
    self.position = { x, y, z }
    self.confidence = 1
    return true
  end

  return instance
end

return odometry

