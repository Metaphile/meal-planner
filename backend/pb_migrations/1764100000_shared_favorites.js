/// <reference path="../pb_data/types.d.ts" />

// Favorites seen by the whole group: a card in hand shows who's favorited
// it. (Still each person's own to add or take back: only reading opens up.)
migrate(
  (app) => {
    const favorites = app.findCollectionByNameOrId('favorites')
    favorites.listRule = '@request.auth.id != ""'
    favorites.viewRule = '@request.auth.id != ""'
    app.save(favorites)
  },
  (app) => {
    const favorites = app.findCollectionByNameOrId('favorites')
    favorites.listRule = 'user = @request.auth.id'
    favorites.viewRule = 'user = @request.auth.id'
    app.save(favorites)
  },
)
