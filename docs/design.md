# Meal Planner

## Overview

My wife and I need a tool to help us plan meals and stock ingredients.

## Features

- **Recipes**
  - Alphabetical list
  - Filter by title, tags
- **Meals**
  - Composed of recipes and/or simple items (e.g., pancakes + bacon)
- **Meal plan**
  - Flat list
  - Drag-and-drop reordering
  - Swipe right to remove
  - Toggle inclusion in ingredients list (see below)
- **Ingredients**
  - Live aggregate view of required ingredients for planned meals
  - Read only
  - Explicitly **not** a shopping list
  - Explicitly **not** an inventory system
- **Account**
  - Generate invite links
  - SSO, no password

## Architecture

- Web based mobile app
- Local first
  - Changes are written to a local store then synced with an authoritative source
  - Works offline
