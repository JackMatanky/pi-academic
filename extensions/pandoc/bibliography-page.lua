-- Start the citeproc bibliography on a new page. The bibliography is the Div
-- with id `refs` (or ending in `__refs`); when a heading directly precedes it,
-- the break goes before the heading. Run after --citeproc, which creates the
-- Div and the `reference-section-title` heading.
local function is_refs(block)
  return block.t == "Div"
    and (block.identifier == "refs" or block.identifier:match("__refs$") ~= nil)
end

local function xml_text(header)
  local text = pandoc.utils.stringify(header)
  return (text:gsub("&", "&amp;"):gsub("<", "&lt;"):gsub(">", "&gt;"))
end

-- A heading carries its own page-break property, so the break adds no empty
-- paragraph above it. Heading text is plain: bookmarks and markup are dropped.
local function docx_heading(header)
  return pandoc.RawBlock(
    "openxml",
    '<w:p><w:pPr><w:pStyle w:val="Heading' .. header.level
      .. '"/><w:pageBreakBefore/></w:pPr><w:r><w:t xml:space="preserve">'
      .. xml_text(header) .. "</w:t></w:r></w:p>"
  )
end

-- ODT needs named styles for the break; the export adds them to the finished
-- file (`addBibliographyPageStyles`).
local function odt_heading(header)
  return pandoc.RawBlock(
    "opendocument",
    '<text:h text:style-name="Bibliography_20_Heading_20_' .. header.level
      .. '" text:outline-level="' .. header.level .. '">'
      .. xml_text(header) .. "</text:h>"
  )
end

local BREAK = {
  docx = pandoc.RawBlock("openxml", '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'),
  odt = pandoc.RawBlock(
    "opendocument",
    '<text:p text:style-name="Bibliography_20_Page_20_Break"/>'
  ),
  latex = pandoc.RawBlock("latex", "\\clearpage"),
}

function Pandoc(doc)
  local blocks = doc.blocks
  for i, block in ipairs(blocks) do
    if is_refs(block) then
      local heading = i > 1 and blocks[i - 1].t == "Header" and blocks[i - 1]
      local at = heading and i - 1 or i
      local kind = FORMAT:match("^latex") and "latex"
        or FORMAT:match("^beamer") and "latex"
        or FORMAT
      local rewrite = ({ docx = docx_heading, odt = odt_heading })[kind]

      if heading and rewrite then
        blocks[at] = rewrite(heading)
      elseif BREAK[kind] then
        blocks:insert(at, BREAK[kind])
      end
      return doc
    end
  end
end
