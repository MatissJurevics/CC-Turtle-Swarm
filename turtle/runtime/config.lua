local config = {}

function config.load(path)
  local target = path or "/fleet/config.lua"
  if not fs.exists(target) then
    return nil, "missing_config"
  end

  local loaded = dofile(target)
  if type(loaded) ~= "table" then
    return nil, "invalid_config"
  end

  local required = { "turtle_id", "fleet_url", "pairing_token", "runtime_version" }
  for _, key in ipairs(required) do
    if loaded[key] == nil or loaded[key] == "" then
      return nil, "missing_" .. key
    end
  end

  return loaded
end

return config

