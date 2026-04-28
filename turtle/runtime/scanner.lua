local scanner = {}

local headings = { "north", "east", "south", "west" }

local function clone_position(position)
  if not position then
    return nil
  end
  return { position[1], position[2], position[3] }
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

local function offset_for_direction(direction)
  if direction == "north" then
    return { 0, 0, -1 }
  end
  if direction == "south" then
    return { 0, 0, 1 }
  end
  if direction == "east" then
    return { 1, 0, 0 }
  end
  if direction == "west" then
    return { -1, 0, 0 }
  end
  if direction == "up" then
    return { 0, 1, 0 }
  end
  if direction == "down" then
    return { 0, -1, 0 }
  end
  return { 0, 0, 0 }
end

local function cell_from_pose(pose, direction)
  if not pose or not pose.position then
    return nil
  end
  local delta = offset_for_direction(direction)
  return {
    dimension = pose.dimension or "overworld",
    x = pose.position[1] + delta[1],
    y = pose.position[2] + delta[2],
    z = pose.position[3] + delta[3]
  }
end

local function normalize_inspect(success, result, direction, pose)
  local observation = {
    direction = direction,
    cell = cell_from_pose(pose, direction),
    observed_from = {
      position = clone_position(pose.position),
      facing = pose.facing,
      dimension = pose.dimension,
      confidence = pose.confidence
    },
    success = success == true,
    confidence = pose.confidence or 0.5
  }

  if success then
    observation.block = block_from_detail(result)
  else
    local message = tostring(result or "unknown")
    observation.error = {
      code = message:lower():find("no block") and "no_block" or "inspect_failed",
      message = message
    }
    if observation.error.code == "no_block" then
      observation.occupancy = "air"
      observation.block = { name = "minecraft:air", state = {}, tags = {} }
      observation.success = true
    end
  end

  return observation
end

local function heading_index(facing)
  for index, heading in ipairs(headings) do
    if heading == facing then
      return index
    end
  end
  return 1
end

function scanner.new(runtime)
  local interval = tonumber(runtime.config.scan_interval_s or runtime.config.scanIntervalS or 10)
  local instance = {
    runtime = runtime,
    interval = math.max(2, interval),
    last_scan = -math.max(2, interval)
  }

  function instance:due(now)
    local current = now or os.clock()
    return current - self.last_scan >= self.interval
  end

  function instance:mark_scanned(now)
    self.last_scan = now or os.clock()
  end

  function instance:turn_right()
    local ok = turtle.turnRight()
    if ok then
      self.runtime.odometry:after_success("turnRight")
    end
    return ok
  end

  function instance:face(direction)
    local guard = 0
    while self.runtime.odometry.facing ~= direction and guard < 4 do
      self:turn_right()
      guard = guard + 1
    end
  end

  function instance:inspect_front(direction)
    local pose = self.runtime.odometry:snapshot()
    local ok, detail_or_reason = turtle.inspect()
    return normalize_inspect(ok, detail_or_reason, direction, pose)
  end

  function instance:scan_vertical(direction, inspect_fn)
    local pose = self.runtime.odometry:snapshot()
    local ok, detail_or_reason = inspect_fn()
    return normalize_inspect(ok, detail_or_reason, direction, pose)
  end

  function instance:scan()
    local started = self.runtime.odometry:snapshot()
    local observations = {}
    local original_facing = started.facing or "north"

    table.insert(observations, self:scan_vertical("up", turtle.inspectUp))
    table.insert(observations, self:scan_vertical("down", turtle.inspectDown))

    for _, direction in ipairs(headings) do
      self:face(direction)
      table.insert(observations, self:inspect_front(direction))
    end
    self:face(original_facing)

    local finished = self.runtime.odometry:snapshot()
    self:mark_scanned()

    return {
      origin = started,
      after = finished,
      scan_interval_s = self.interval,
      observations = observations
    }
  end

  return instance
end

return scanner
