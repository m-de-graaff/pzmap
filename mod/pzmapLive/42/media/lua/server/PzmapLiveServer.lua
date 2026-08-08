-- Server-side counterpart to PzmapLiveClient.lua: writes every online
-- player's position to Zomboid/Lua/pzmap-live-server.json on a throttled
-- tick, in the same protocol (src/live/protocol.ts in the pzmap web repo).
-- Runs only on a dedicated/hosted server, not in singleplayer.

local FILE_NAME = "pzmap-live-server.json"
local WRITE_INTERVAL_MS = 1000
local PROTOCOL_VERSION = 1

local lastWriteMs = 0

local JSON_ESCAPES = { ['\\'] = '\\\\', ['"'] = '\\"', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }

local function escapeJSON(str)
    return (str:gsub('[%c\\"]', function(c)
        return JSON_ESCAPES[c] or string.format('\\u%04x', c:byte())
    end))
end

local function playerJSON(player)
    local id = tostring(player:getOnlineID())
    local name = escapeJSON(player:getUsername() or "Survivor")
    local x = math.floor(player:getX())
    local y = math.floor(player:getY())
    local z = math.floor(player:getZ())
    local facing = player:getDirectionAngle() or 0
    local updatedAt = math.floor(os.time() * 1000)

    local json = string.format(
        '{"id":"%s","name":"%s","x":%d,"y":%d,"z":%d,"facing":%.1f,"updatedAt":%d',
        id, name, x, y, z, facing, updatedAt
    )

    -- Tag with the player's B42 faction, if any, so pzmap-bridge can scope
    -- whole-server visibility to a single faction with --group.
    local faction = Faction.getPlayerFaction(player)
    if faction then
        json = json .. ',"group":"' .. escapeJSON(faction:getName()) .. '"'
    end

    return json .. '}'
end

local function writePayload()
    local writer = getFileWriter(FILE_NAME, true, false)
    if not writer then return end

    local players = getOnlinePlayers()
    local parts = {}
    for i = 0, players:size() - 1 do
        parts[#parts + 1] = playerJSON(players:get(i))
    end

    writer:write('{"v":' .. PROTOCOL_VERSION .. ',"players":[' .. table.concat(parts, ',') .. ']}')
    writer:close()
end

local function onTick()
    local now = getTimestampMs()
    if now - lastWriteMs < WRITE_INTERVAL_MS then return end
    lastWriteMs = now

    writePayload()
end

Events.OnTick.Add(onTick)
