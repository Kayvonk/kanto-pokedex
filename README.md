# Kanto Pokédex

**Live app: [kanto-pokedex.onrender.com](https://kanto-pokedex.onrender.com/)**

An interactive, browser-based Pokédex application styled after the classic handheld device from the Pokémon games. Browse up to 1,026 Pokémon including alternative forms, scan Pokémon using your camera with AI-powered recognition, save your favorites into storage boxes, collect acheivement medals, and save your progress.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Usage Guide](#usage-guide)
  - [Browsing Pokémon](#browsing-pokémon)
  - [Searching](#searching)
  - [Camera Scan](#camera-scan)
  - [Info Panel](#info-panel)
  - [Pokédex List](#pokédex-list)
  - [Storage Boxes](#storage-boxes)
  - [Achievements](#achievements)
  - [Save & Load](#save--load)
- [Button Reference](#button-reference)
- [Deployment](#deployment)
- [Disclaimer](#disclaimer)

---

## Features

- Browse up to 1,026 Pokémon including alternative forms, with artwork and game sprites
- Real-time Pokémon identification via webcam using Google Gemini Vision AI
- Multilingual descriptions (English, French, German, Spanish, Italian, Japanese, Korean, Simplified Chinese, Traditional Chinese)
- Text-to-speech with voice selection
- Shiny sprite toggle
- Type-based achievement medals with four tiers
- 10-slot storage box system for saving favourite Pokémon
- Encrypted save/load system via `.pkdx` files
- Fully responsive — works on desktop and mobile

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Python 3, Flask |
| AI / Vision | Google Gemini 2.5 Flash |
| Pokémon Data | PokeAPI + local JSON cache |
| Speech | Web Speech API |
| Camera | WebRTC / MediaDevices API |
| Production Server | Gunicorn |

---

## Prerequisites

- Python 3.7 or higher
- `pip`
- A Google Cloud account with the **Gemini API** enabled
- A modern browser with camera access (for scan functionality)

---

## Installation

**1. Clone the repository**

```bash
git clone https://github.com/your-username/pokedex-sandbox.git
cd pokedex-sandbox
```

**2. Create and activate a virtual environment (recommended)**

```bash
python -m venv venv

# macOS / Linux
source venv/bin/activate

# Windows
venv\Scripts\activate
```

**3. Install dependencies**

```bash
pip install -r requirements.txt
```

---

## Configuration

Create a `.env` file in the project root with the following:

```env
GOOGLE_API_KEY=your_google_api_key_here
```

To obtain a Google API key:
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Enable the Gemini API for your project

The camera scan feature will not work without a valid key. All other functionality (browsing, search, storage, achievements) works without it.

---

## Running the App

**Development**

```bash
python server.py
```

Then open your browser and navigate to `http://localhost:3000`.

**Production (Gunicorn)**

```bash
gunicorn --bind 0.0.0.0:3000 --timeout 120 server:app
```

---

## Usage Guide

### Browsing Pokémon

Use the **D-pad** on the left panel to navigate the Pokédex:

- **Left / Right arrows** — go to the previous or next Pokémon
- **Up arrow** — jump back 10 Pokémon
- **Down arrow** — jump forward 10 Pokémon

The main screen displays the selected Pokémon's artwork. Use the **Shiny button** (red circle, bottom-left of the screen) to toggle between the normal and shiny sprite variants.

---

### Searching

Type a Pokémon name or Pokédex number into the **search field** at the bottom of the left panel, then press the **Search button** or hit Enter. The app will jump directly to that Pokémon or display a list of matching results.

---

### Camera Scan

1. Click the **camera icon** at the top of the left panel.
2. Allow browser camera permissions when prompted.
3. Point your camera at a Pokémon (on a card, screen, figure, etc.).
4. Hold steady — the **lock bar** on screen fills as the image stabilises.
5. Once stable, the image is sent to Google Gemini for identification.
6. If a Pokémon is recognised, its data loads automatically and it is marked as **scanned** in your Pokédex.

Press **Esc** or click the camera icon again to close the camera feed.

> **Note:** Camera scan requires a valid `GOOGLE_API_KEY` in your `.env` file.

---

### Info Panel

Click the **right arrow button** on the left panel (or select a Pokémon from the list) to open the info panel on the right side of the device.

The info panel displays:
- Pokémon name and Pokédex ID
- Type(s)
- Flavour text description in your chosen language

Use the **language dropdown** on the left panel to change the description language. Use the **voice dropdown** and **volume buttons** to control text-to-speech playback. Press the **Cry button** (speaker icon) to hear the Pokémon's cry.

Click the **left arrow button** on the right panel to return to the main menu.

---

### Pokédex List

From the right panel menu, click **Pokédex** to open the full list of up to 1,026 Pokémon, including alternative forms.

- **Filter button** — toggle the filter dropdown
- **Filter dropdown** — show All, Scanned only, or Unscanned only
- Click any Pokémon in the list to navigate to it and view its details

---

### Storage Boxes

From the right panel menu, click the storage grid at the middle of the right panel to open a storage box.

- There are **10 storage boxes** arranged in a 2×5 grid
- Use the **Previous / Next buttons** below the grid to page through boxes
- When viewing a box, use the **Previous / Next arrows** at the bottom of the right panel to navigate between boxes
- Click any slot to view that Pokémon's details
- Click the **Favourite button** (heart icon) at the bottom of the right panel to add the currently displayed Pokémon to the active storage box

---

### Achievements

From the right panel menu, click **Achievements** to view your medal collection.

There are **18 medals** — one for each Pokémon type plus an overall completion medal. Each medal has four tiers based on the percentage of Pokémon of that type you have scanned:

| Tier | Threshold |
|---|---|
| Bronze | 10% scanned |
| Silver | 30% scanned |
| Gold | 60% scanned |
| Rainbow | 100% scanned |

Click any medal to see detailed progress, including a visual progress bar and the criteria for each tier.

---

### Save & Load

From the right panel menu, click **Save / Load** to manage your progress.

- **Save button** — downloads an encrypted `.pkdx` backup file to your device. This file contains your scanned list, storage boxes, voice preferences, volume, and language settings.
- **Load button** — opens a file picker. Select a previously saved `.pkdx` file to restore your progress.

> Save files use AES-GCM encryption and are specific to this application.

---

## Button Reference

### Left Panel

| Control | Function |
|---|---|
| Camera icon | Toggle webcam / camera scan mode |
| Shiny button (red circle) | Toggle normal / shiny sprite |
| D-pad Up | Jump back 10 Pokémon |
| D-pad Down | Jump forward 10 Pokémon |
| D-pad Left | Previous Pokémon |
| D-pad Right | Next Pokémon |
| Cry button (🔊) | Play Pokémon cry audio |
| Volume Down | Decrease text-to-speech volume |
| Volume Up | Increase text-to-speech volume |
| Voice dropdown | Select text-to-speech voice |
| Language dropdown | Select description language |
| Search field | Type Pokémon name or ID |
| Search button | Execute search |
| Right arrow (top) | Open / expand right info panel |

### Right Panel

| Control | Function |
|---|---|
| Left arrow | Return to previous view / main menu |
| Pokédex button | Open full Pokédex list |
| Achievements button | Open achievements / medals view |
| Save / Load button | Open save & load screen |
| Filter button (in Pokédex list) | Toggle filter dropdown |
| Filter dropdown | Filter by All / Scanned / Unscanned |
| Storage box grid | Open selected storage box |
| Previous / Next (storage) | Navigate between storage box pages |
| Favourite button (heart) | Add current Pokémon to active storage box |
| Previous button (bottom) | Previous Pokémon in current list |
| Next button (bottom) | Next Pokémon in current list |
| Save button | Download encrypted `.pkdx` save file |
| Load button | Restore from `.pkdx` save file |

---

## Deployment

This project is Heroku-ready via the included `Procfile`. To deploy:

1. Create a Heroku app and connect your repository.
2. Set the `GOOGLE_API_KEY` config var in the Heroku dashboard.
3. Push to deploy — Heroku will automatically use Gunicorn via the `Procfile`.

---

## Disclaimer

**This project is an unofficial fan-made application and is not affiliated with, endorsed by, or connected to Nintendo, Game Freak, The Pokémon Company, or any of their subsidiaries or affiliates.**

- Pokémon and all related names, characters, and imagery are trademarks and copyrights of Nintendo / Creatures Inc. / GAME FREAK inc.
- This application is created purely for **educational and personal entertainment purposes**.
- This project is **non-commercial** — it is not sold, monetised, or used for any form of profit.
- This project is intended to demonstrate web development techniques, AI/ML API integration, and browser API usage.

If you are a rights holder and have concerns about this project, please open an issue and it will be addressed promptly.

---

*Pokémon data provided by [PokéAPI](https://pokeapi.co/). AI recognition powered by [Google Gemini](https://ai.google.dev/).*
