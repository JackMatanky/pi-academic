-- Resolve links to note anchors (`[](#fn-id)`) to the note's final number.
-- An anchor is an empty span `[]{#fn-id}`: inside a note it names that note,
-- anywhere else it names the next note that follows it. Run after --citeproc,
-- so notes citeproc generates are counted too.
local ids, pending, count = {}, {}, 0

local function is_anchor(span)
  return span.identifier:sub(1, 3) == "fn-"
end

local function bind(id, n)
  if ids[id] then
    error("note anchor #" .. id .. " is defined more than once")
  end
  ids[id] = n
end

local function number_notes(doc)
  doc:walk({
    traverse = "topdown",
    Note = function(note)
      count = count + 1
      for _, id in ipairs(pending) do bind(id, count) end
      pending = {}
      pandoc.Div(note.content):walk({
        Span = function(span)
          if is_anchor(span) then bind(span.identifier, count) end
        end,
      })
      return nil, false
    end,
    Span = function(span)
      if is_anchor(span) then pending[#pending + 1] = span.identifier end
    end,
  })
  if #pending > 0 then
    error("note anchor #" .. pending[1] .. " has no note after it")
  end
end

function Pandoc(doc)
  number_notes(doc)
  return doc:walk({
    Link = function(link)
      local id = link.target:match("^#(fn%-.+)$")
      if not id then return nil end
      local n = ids[id]
      if not n then
        error("link to #" .. id .. " has no matching note anchor")
      end
      local label = pandoc.utils.stringify(link.content)
      return pandoc.Str(label == "" and tostring(n) or (label .. "\u{A0}" .. n))
    end,
    Span = function(span)
      if is_anchor(span) then return span.content end
    end,
  })
end
