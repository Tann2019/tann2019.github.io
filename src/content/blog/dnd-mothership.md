---
title: "DnD Mothership — Live Character Sheets on a $20 Touchscreen"
description: "Building a tabletop D&D companion system where every player gets an ESP32 touchscreen and the DM pushes live updates from a laptop dashboard."
pubDate: 2026-05-06
tags: ["esp32", "lvgl", "websockets", "platformio", "dnd"]
---

I wanted my D&D group to stop fumbling with paper sheets and pencil erasers. Track HP, spell slots, conditions, and DM notes in a way that's actually fun. So I built **DnD Mothership**: each player carries a small ESP32 touchscreen that talks over WebSockets to a Node.js server on the DM's laptop. The DM updates a character from a browser; the player's board redraws in under 100ms.

Three cheap-ish boards, one laptop, no app installs.

## The Hardware

Each player's screen is a **Sunton ESP32-3248S035R** — an ESP32-WROOM-32 fused to a 3.5" 320×480 ST7796 LCD with an XPT2046 resistive touch overlay. About $20 each on AliExpress. The whole thing draws power and flashes firmware over a single USB-C cable.

The interesting wiring detail: display and touch share the HSPI bus, but the touch controller has its own chip-select pin (GPIO 33). TFT_eSPI handles both if you set the right build flags:

```ini
-D ST7796_DRIVER=1
-D TFT_RGB_ORDER=TFT_BGR
-D TOUCH_CS=33
-D USE_HSPI_PORT=1
```

Get any of those wrong and you either see green-and-purple soup, no touches at all, or — my favorite failure mode — a screen that looks correct but interprets every tap as if the screen were rotated 90°.

## The Stack

- **Firmware:** PlatformIO + Arduino + **LVGL 8.3** + TFT_eSPI + ArduinoJson v7
- **Transport:** `links2004/WebSockets` client on the board, the `ws` library on the server
- **Server:** Express + `ws`, character data persisted as one JSON file per character in `server/characters/`
- **DM dashboard:** static HTML/CSS/JS served straight from `/public`

No build step on the server side, no React, no bundler. The DM browser is a thin window into a Node process. The board is a thin window into the same process. Everything flows through one WebSocket protocol.

## LVGL on a Constrained Device

LVGL is wonderful but happily eats all your DRAM if you let it. The trick is the draw buffer: instead of double-buffering the full 480×320 framebuffer (300+ KB), I allocate a strip 20 lines tall:

```cpp
static constexpr uint32_t BUF_LINES = 20;
static lv_color_t buf1[SCREEN_W * BUF_LINES];   // ~19 KB, fits comfortably
```

LVGL renders dirty regions into that strip and the flush callback DMA's it to the panel. With `LV_COLOR_16_SWAP=1` set in `lv_conf.h`, LVGL pre-swaps RGB565 bytes for me, so the flush is a single `tft.pushColors(...)` with no extra byte massaging.

```cpp
static void my_disp_flush(lv_disp_drv_t* drv, const lv_area_t* area, lv_color_t* color_p) {
  uint32_t w = area->x2 - area->x1 + 1;
  uint32_t h = area->y2 - area->y1 + 1;
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, w, h);
  tft.pushColors((uint16_t*)&color_p->full, w * h, false);
  tft.endWrite();
  lv_disp_flush_ready(drv);
}
```

## Touch Calibration That Survives a Reboot

Resistive touch panels need calibration, and that calibration is *physical* — it's about the ADC values that map to the four corners of the screen. You don't want to recalibrate every boot. So I run TFT_eSPI's calibration routine *before* `lv_init()`, write the five calibration values into NVS via the `Preferences` API, and check NVS first on subsequent boots.

```cpp
prefs.begin("touch", false);
size_t got = prefs.getBytes("cal", cal, sizeof(cal));
prefs.end();

if (got == sizeof(cal)) { tft.setTouch(cal); return; }

// First boot: draw the corner-arrow prompt with bare TFT_eSPI calls,
// run calibrateTouch, persist the result, then hand control to LVGL.
```

`pio run -t erase` wipes NVS if I ever need to redo it. After that, the first boot screen says "Touch the arrow in each corner" — and that's the only time anyone has to do it.

## The Protocol

Everything between board, server, and DM is JSON over WebSocket. Symmetric and small:

**Player → server**
```json
{"type":"hello", "character_id":"thorin"}
{"type":"adjust_hp", "delta":-5}
{"type":"use_slot", "level":3}
{"type":"long_rest"}
{"type":"request_roster"}
```

**Server → player**
```json
{"type":"state", "character":{...}}
{"type":"roster", "characters":[...]}
{"type":"notification", "title":"...", "body":"...", "level":"warn"}
{"type":"handout", "handout":{...}}
{"type":"initiative", "initiative":{...}}
```

The server is the source of truth. The board never assumes a button press succeeded — it sends the intent (`adjust_hp`, `delta: -5`), waits for the server to broadcast a fresh `state`, and re-renders from that. So when the DM overrides a value from the dashboard, every connected board converges automatically. No reconciliation logic, no optimistic UI gone wrong.

## Reconnect, Forever

A laptop closing for a bathroom break shouldn't kill a session. The WebSocket client is configured to:

```cpp
ws.setReconnectInterval(3000);
ws.enableHeartbeat(15000, 3000, 2);
```

Every 15 seconds the board pings the server. If two pings go unanswered, the socket drops and reconnects every 3 seconds until it gets through. On reconnect the board automatically re-sends its `hello` with whatever character ID is saved in NVS. The DM closes their laptop, opens it again ten minutes later, and every player's board just *comes back*. No restart, no menus.

If the DM deletes a character mid-session, the server replies with `{"type":"error", "code":"unknown_character"}` and the board falls back to the roster picker — a small but satisfying recovery path that I'm proud of.

## What's Next

I want to add:

- **Dice rolls** — let the DM roll for a hidden check and push only the result to a single board.
- **Initiative tracker** improvements — current order is shown but I want a "you're up next" toast.
- **Battery** — these run off USB right now. A 3.7V LiPo and a charging board would make them properly portable.

The code is at [`Tann2019/DND-ESP32`](https://github.com/Tann2019/DND-ESP32) (private repo for now — it's still rough around the edges). If you've built something similar or are thinking about it, I'd love to hear about it.
