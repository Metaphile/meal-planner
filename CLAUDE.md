# Meals — notes for Claude

## Visual design

### Centre icons by their visual weight, not their boxes

An icon placed in a row (`items-center`, or centred on a line of text) is
centred by its bounding box. A shape that doesn't fill its box evenly then
*looks* off-centre, even though the boxes line up. A star's weight is low
(between its feet), so it looks like it sits low. The tag's weight is high
(its wide end is at the top), so it looks like it sits high.

Whenever an icon or glyph is placed beside others (a new icon, a changed
shape, a different size), check its visual centre:

1. **Measure.** Rasterize the shape as drawn, with its stroke and minus any
   holes, and take its centre of mass (alpha-weighted centroid). Compare that
   with the centre of its box, and convert the difference from viewBox units
   to px (`× size / viewBox width`). For a quick measurement, run this in the
   browser pane with `javascript_tool`: draw a `Path2D` on a canvas scaled
   ~40×, then sum the alpha over `getImageData`.
2. **Shift the whole picture, not the drawing inside it.** Use `position:
   relative; top: …` on the `<svg>`, and keep the offset as a named constant
   in viewBox units, with a comment saying why. Don't move the path within
   its viewBox. That draws outside the box, and on a card tilted in the box
   anything outside it can be clipped or repainted stale.
3. **Move what's attached with it**, such as the rings around the favorite
   star.
4. **Verify** in the browser: the icon's box centre ± its shift should equal
   its neighbours' centres.

Horizontal weight matters too where an icon is centred horizontally on
something. In a row of icons, vertical alignment is what shows.

Where it's done so far:

- `STAR_LIFT` in `src/components/RecipeCard.tsx`: the star, and its rings
  (`StarRings`).
- `DROP` in `src/components/TagFilter.tsx`: the tag.

Symmetric shapes (the Want box, the gear) need nothing.
