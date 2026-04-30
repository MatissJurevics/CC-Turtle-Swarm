local logger = {}

function logger.new(component)
  local instance = {
    component = component or "runtime",
    sink = nil
  }

  local function write(self, level, message, fields)
    local entry = {
      level = level,
      component = self.component,
      message = message,
      fields = fields or {},
      ts = os.epoch("utc")
    }
    print(textutils.serializeJSON(entry))
    if self.sink then
      pcall(self.sink, entry)
    end
  end

  function instance:set_sink(sink)
    self.sink = sink
  end

  function instance:info(message, fields)
    write(self, "info", message, fields)
  end

  function instance:error(message, fields)
    write(self, "error", message, fields)
  end

  return instance
end

return logger
