local watchdog = {}

function watchdog.deadline(timeout_ms)
  if not timeout_ms then
    return nil
  end
  return os.epoch("utc") + timeout_ms
end

function watchdog.expired(deadline)
  return deadline ~= nil and os.epoch("utc") > deadline
end

return watchdog

