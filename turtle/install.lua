local args = { ... }

local runtime_version = "0.1.0"

local files = {
  { path = "/startup.lua", url = "/turtle/files/startup.lua" },
  { path = "/fleet/runtime/config.lua", url = "/turtle/files/runtime/config.lua" },
  { path = "/fleet/runtime/logger.lua", url = "/turtle/files/runtime/logger.lua" },
  { path = "/fleet/runtime/spool.lua", url = "/turtle/files/runtime/spool.lua" },
  { path = "/fleet/runtime/actuator.lua", url = "/turtle/files/runtime/actuator.lua" },
  { path = "/fleet/runtime/transport.lua", url = "/turtle/files/runtime/transport.lua" },
  { path = "/fleet/runtime/watchdog.lua", url = "/turtle/files/runtime/watchdog.lua" },
  { path = "/fleet/runtime/executor.lua", url = "/turtle/files/runtime/executor.lua" },
  { path = "/fleet/runtime/odometry.lua", url = "/turtle/files/runtime/odometry.lua" },
  { path = "/fleet/runtime/scanner.lua", url = "/turtle/files/runtime/scanner.lua" },
  { path = "/fleet/runtime/main.lua", url = "/turtle/files/runtime/main.lua" }
}

local function usage()
  print("Usage:")
  print("wget run http://HOST:8787/turtle/install.lua http://HOST:8787 TOKEN [TURTLE_ID]")
end

local function trim(value)
  return tostring(value or ""):match("^%s*(.-)%s*$")
end

local function normalize_server_url(value)
  local url = trim(value)
  if url == "" then
    return nil
  end
  if not url:match("^https?://") then
    url = "http://" .. url
  end
  while url:sub(-1) == "/" do
    url = url:sub(1, -2)
  end
  return url
end

local function websocket_url(server_url)
  return (server_url:gsub("^http://", "ws://"):gsub("^https://", "wss://")) .. "/turtle/ws"
end

local function quote(value)
  return string.format("%q", tostring(value))
end

local function ensure_dir(path)
  if path == nil or path == "" or path == "/" or fs.exists(path) then
    return
  end
  local parent = fs.getDir(path)
  if parent ~= nil and parent ~= "" and parent ~= path then
    ensure_dir(parent)
  end
  if not fs.exists(path) then
    fs.makeDir(path)
  end
end

local function write_file(path, contents)
  local dir = fs.getDir(path)
  ensure_dir(dir)
  if fs.exists(path) then
    fs.delete(path)
  end
  local handle = fs.open(path, "w")
  if not handle then
    error("could not write " .. path, 0)
  end
  handle.write(contents)
  handle.close()
end

local function fetch(url)
  if not http or not http.get then
    error("HTTP API is disabled. Enable CC:Tweaked HTTP and allow this server address.", 0)
  end
  local response, reason = http.get(url)
  if not response then
    error("download failed: " .. url .. " (" .. tostring(reason) .. ")", 0)
  end
  local body = response.readAll()
  response.close()
  if body == nil or body == "" then
    error("download returned empty body: " .. url, 0)
  end
  return body
end

local function default_turtle_id()
  return os.getComputerLabel() or ("turtle-" .. tostring(os.getComputerID()))
end

local server_url = normalize_server_url(args[1])
local pairing_token = trim(args[2])
local turtle_id = trim(args[3])

if not server_url or pairing_token == "" then
  usage()
  error("missing server URL or pairing token", 0)
end

if turtle_id == "" then
  turtle_id = default_turtle_id()
end

print("Installing fleet runtime")
print("Server: " .. server_url)
print("Turtle: " .. turtle_id)

for _, file in ipairs(files) do
  print("Downloading " .. file.path)
  write_file(file.path, fetch(server_url .. file.url))
end

write_file("/fleet/config.lua", table.concat({
  "return {",
  "  turtle_id = " .. quote(turtle_id) .. ",",
  "  fleet_url = " .. quote(websocket_url(server_url)) .. ",",
  "  pairing_token = " .. quote(pairing_token) .. ",",
  "  runtime_version = " .. quote(runtime_version) .. ",",
  "  dimension = \"overworld\",",
  "  initial_facing = \"north\",",
  "  initial_position = nil",
  "}",
  ""
}, "\n"))

pcall(os.setComputerLabel, turtle_id)

print("Install complete.")
print("Rebooting into fleet runtime...")
sleep(1)
os.reboot()
