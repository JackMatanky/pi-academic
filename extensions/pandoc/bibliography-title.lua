-- Give the citeproc bibliography the heading its citation style calls for.
-- Run before --citeproc, with `-M bibliography-default-title=TITLE`. A title the
-- article sets itself (`reference-section-title`), a heading the author wrote
-- before the bibliography, and a document language other than English all win.
local function is_refs(block)
  return block.t == "Div"
    and (block.identifier == "refs" or block.identifier:match("__refs$") ~= nil)
end

local function has_own_heading(blocks)
  local last = blocks[#blocks]
  if last and last.t == "Header" then return true end
  for i, block in ipairs(blocks) do
    if is_refs(block) then
      return (i > 1 and blocks[i - 1].t == "Header")
        or (block.content[1] ~= nil and block.content[1].t == "Header")
    end
  end
  return false
end

function Pandoc(doc)
  local meta = doc.meta
  local default = meta["bibliography-default-title"]
  meta["bibliography-default-title"] = nil
  local lang = meta.lang and pandoc.utils.stringify(meta.lang) or "en"
  if default and not meta["reference-section-title"] and lang:match("^en")
    and not has_own_heading(doc.blocks) then
    meta["reference-section-title"] = default
  end
  return pandoc.Pandoc(doc.blocks, meta)
end
