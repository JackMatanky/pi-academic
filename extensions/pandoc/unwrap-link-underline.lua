-- Word styles hyperlinks as underlined text, which Pandoc reads as an
-- Underline inside the Link and writes as [[text]{.underline}](url). Drop the
-- underline inside links; keep other underlines.
function Link(link)
  link.content = link.content:walk({
    Underline = function(underline)
      return underline.content
    end,
  })
  return link
end
