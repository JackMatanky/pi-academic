-- Word highlights arrive as [text]{.mark}; keep the text, drop the mark.
function Span(span)
  if span.classes:includes("mark") then
    return span.content
  end
end
