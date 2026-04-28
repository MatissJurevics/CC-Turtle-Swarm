local executor = {}

local function safe_env(rt)
  return {
    assert = assert,
    error = error,
    ipairs = ipairs,
    next = next,
    pairs = pairs,
    pcall = pcall,
    select = select,
    tonumber = tonumber,
    tostring = tostring,
    type = type,
    math = math,
    string = string,
    table = table,
    textutils = textutils,
    rt = rt
  }
end

function executor.new(runtime, actuator)
  local instance = {
    runtime = runtime,
    actuator = actuator
  }

  function instance:load_script(script_id)
    local path = "/fleet/scripts/" .. script_id .. "/main.lua"
    if not fs.exists(path) then
      return nil, "script_not_installed"
    end
    local chunk, err = loadfile(path, "t", safe_env(self:runtime_api()))
    if not chunk then
      return nil, err
    end
    return chunk
  end

  function instance:runtime_api()
    local api = {}
    local allowed_actions = {
      "forward",
      "back",
      "up",
      "down",
      "turnLeft",
      "turnRight",
      "dig",
      "digUp",
      "digDown",
      "place",
      "placeUp",
      "placeDown",
      "inspect",
      "inspectUp",
      "inspectDown"
    }
    for _, action in ipairs(allowed_actions) do
      api[action] = function(...)
        return self.actuator:run(action, { ... }, { mode = "script" })
      end
    end
    api.emit = function(event_type, body)
      return self.runtime:emit(event_type, body)
    end
    api.observe = function()
      return self.runtime:observe()
    end
    return api
  end

  function instance:run(script_id, args)
    local chunk, err = self:load_script(script_id)
    if not chunk then
      return false, { code = "script_not_installed", message = err }
    end
    local ok, result = pcall(chunk, self:runtime_api(), args or {})
    if not ok then
      return false, { code = "script_crashed", message = tostring(result) }
    end
    return true, result
  end

  return instance
end

return executor

