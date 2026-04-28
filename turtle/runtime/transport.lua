local transport = {}

local function urlencode(value)
  return tostring(value):gsub("([^%w%-_%.~])", function(char)
    return string.format("%%%02X", string.byte(char))
  end)
end

function transport.new(config, logger)
  local instance = {
    config = config,
    logger = logger,
    ws = nil,
    backoff = 1
  }

  function instance:url()
    local sep = self.config.fleet_url:find("?", 1, true) and "&" or "?"
    return self.config.fleet_url
      .. sep
      .. "turtle_id="
      .. urlencode(self.config.turtle_id)
      .. "&token="
      .. urlencode(self.config.pairing_token)
  end

  function instance:connect()
    if self.ws then
      return true
    end
    if not http or not http.websocket then
      self.logger:error("websocket unavailable", { error = "http.websocket missing" })
      sleep(self.backoff)
      self.backoff = math.min(self.backoff * 2, 30)
      return false, "websocket_unavailable"
    end
    local ws, err = http.websocket(self:url())
    if not ws then
      self.logger:error("websocket connect failed", { error = err, backoff = self.backoff })
      sleep(self.backoff)
      self.backoff = math.min(self.backoff * 2, 30)
      return false, err
    end
    self.ws = ws
    self.backoff = 1
    self.logger:info("websocket connected", { url = self.config.fleet_url })
    return true
  end

  function instance:close()
    if self.ws then
      pcall(function()
        self.ws.close()
      end)
    end
    self.ws = nil
  end

  function instance:send(message)
    if not self.ws then
      return false, "not_connected"
    end
    local ok, err = pcall(function()
      self.ws.send(textutils.serializeJSON(message))
    end)
    if not ok then
      self.logger:error("websocket send failed", { error = err })
      self:close()
      return false, err
    end
    return true
  end

  function instance:receive(timeout)
    if not self.ws then
      return nil, "not_connected"
    end
    local ok, message = pcall(function()
      return self.ws.receive(timeout)
    end)
    if not ok then
      self.logger:error("websocket receive failed", { error = message })
      self:close()
      return nil, message
    end
    if not message then
      return nil
    end
    return textutils.unserializeJSON(message)
  end

  return instance
end

return transport
