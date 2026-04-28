local logger = {}

function logger.new(component)
  local instance = {
    component = component or "runtime"
  }

  function instance:info(message, fields)
    print(textutils.serializeJSON({
      level = "info",
      component = self.component,
      message = message,
      fields = fields or {},
      ts = os.epoch("utc")
    }))
  end

  function instance:error(message, fields)
    print(textutils.serializeJSON({
      level = "error",
      component = self.component,
      message = message,
      fields = fields or {},
      ts = os.epoch("utc")
    }))
  end

  return instance
end

return logger

