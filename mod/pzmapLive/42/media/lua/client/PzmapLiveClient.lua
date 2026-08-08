-- Writes the local player's position to Zomboid/Lua/pzmap-live.json on a
-- throttled tick, in the protocol described in src/live/protocol.ts
-- (pzmap web repo). WRITE_INTERVAL_MS is a placeholder for a future mod
-- options setting (see plan piece 1, Global Constraints).

local FILE_NAME = "pzmap-live.json"
local WRITE_INTERVAL_MS = 1000
local PROTOCOL_VERSION = 1

local lastWriteMs = 0

local JSON_ESCAPES = { ['\\'] = '\\\\', ['"'] = '\\"', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function escapeJSON(str)
    return (str:gsub('[%c\\"]', function(c)
        return JSON_ESCAPES[c] or string.format('\\u%04x', c:byte())
    end))
end

local function writePayload(player)
    local writer = getFileWriter(FILE_NAME, true, false)
    if not writer then return end

    local id = tostring(player:getOnlineID())
    local name = escapeJSON(player:getUsername() or "Survivor")
    local x = math.floor(player:getX())
    local y = math.floor(player:getY())
    local z = math.floor(player:getZ())
    local facing = player:getDirectionAngle() or 0
    local updatedAt = math.floor(os.time() * 1000)

    local playerJson = string.format(
        '{"id":"%s","name":"%s","x":%d,"y":%d,"z":%d,"facing":%.1f,"updatedAt":%d',
        id, name, x, y, z, facing, updatedAt
    )

    -- Tag with the player's B42 faction, if any — kept consistent with the
    -- server half's payload shape even though solo/friends sharing doesn't
    -- currently use it for visibility scoping.
    local faction = Faction.getPlayerFaction(player)
    if faction then
        playerJson = playerJson .. ',"group":"' .. escapeJSON(faction:getName()) .. '"'
    end
    playerJson = playerJson .. '}'

    local json = string.format('{"v":%d,"players":[%s]}', PROTOCOL_VERSION, playerJson)

    writer:write(json)
    writer:close()
end

local function onTick()
    local now = getTimestampMs()
    if now - lastWriteMs < WRITE_INTERVAL_MS then return end
    lastWriteMs = now

    local player = getPlayer()
    if not player then return end

    writePayload(player)
end

Events.OnTick.Add(onTick)
