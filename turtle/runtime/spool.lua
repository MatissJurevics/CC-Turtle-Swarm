local spool = {}

local function read_json_lines(path)
  if not fs.exists(path) then
    return {}
  end

  local events = {}
  local handle = fs.open(path, "r")
  while true do
    local line = handle.readLine()
    if not line then
      break
    end
    local event = textutils.unserializeJSON(line)
    if event then
      table.insert(events, event)
    end
  end
  handle.close()
  return events
end

local function write_json_lines(path, events)
  local handle = fs.open(path, "w")
  for _, event in ipairs(events) do
    handle.writeLine(textutils.serializeJSON(event))
  end
  handle.close()
end

function spool.new(path)
  local instance = {
    path = path or "/fleet/events.spool"
  }

  function instance:append(event)
    local handle = fs.open(self.path, "a")
    handle.writeLine(textutils.serializeJSON(event))
    handle.close()
  end

  function instance:all()
    return read_json_lines(self.path)
  end

  function instance:ack(event_id)
    local remaining = {}
    for _, event in ipairs(read_json_lines(self.path)) do
      if event.event_id ~= event_id then
        table.insert(remaining, event)
      end
    end
    write_json_lines(self.path, remaining)
  end

  return instance
end

return spool

