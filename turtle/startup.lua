local config_path = "/fleet/config.lua"
local runtime_entry = "/fleet/runtime/main.lua"

local function ensure_dir(path)
  if not fs.exists(path) then
    fs.makeDir(path)
  end
end

local function write_default_config()
  ensure_dir("/fleet")
  local handle = fs.open(config_path, "w")
  handle.writeLine("return {")
  handle.writeLine("  turtle_id = os.getComputerLabel() or ('turtle-' .. os.getComputerID()),")
  handle.writeLine("  fleet_url = 'ws://127.0.0.1:8787/turtle/ws',")
  handle.writeLine("  pairing_token = 'dev-pairing-token',")
  handle.writeLine("  runtime_version = '0.1.0'")
  handle.writeLine("}")
  handle.close()
end

if not fs.exists(config_path) then
  write_default_config()
  print("Created " .. config_path .. ". Edit fleet_url and pairing_token, then reboot.")
  return
end

if not fs.exists(runtime_entry) then
  print("Missing " .. runtime_entry)
  print("Install turtle/runtime into /fleet/runtime before rebooting.")
  return
end

local ok, err = pcall(function()
  shell.run(runtime_entry)
end)

if not ok then
  print("Fleet runtime crashed: " .. tostring(err))
  sleep(5)
  os.reboot()
end

