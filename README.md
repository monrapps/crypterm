# Crypterm

Crypterm is a powerful, terminal-based dashboard for monitoring your cryptocurrency portfolio in real-time. It aggregates data from multiple exchanges and sources, giving you a consolidated view of your assets, orders, and market indicators directly in your command line.

## Features

- **Multi-Exchange Support:** Connects to dozens of cryptocurrency exchanges (powered by the `ccxt` library).
- **Real-time Portfolio Tracking:** View your balances (free, used, and total) across all connected exchanges.
- **Consolidated Equity View:** Calculates your total portfolio value in a primary currency (e.g., BRL, USDT) and a secondary currency (e.g., BTC).
- **Live Ticker Monitoring:** Keep an eye on market prices, volume, VWAP, and daily percentage change for your pairs of interest.
- **Order Management:** See your open and recently closed orders at a glance.
- **Market Sentiment:** Integrates the **Fear and Greed Index** to help you gauge market sentiment.
- **Whale Watching:** Displays large transaction alerts from **Whale Alert**.
- **Customizable TUI:** A rich, interactive Terminal User Interface built with `blessed` and `blessed-contrib`.

## Docker Setup (Recommended)

To run Crypterm using Docker, follow these steps:

1.  **Build and run the container:**
    ```bash
    docker-compose up -d --build
    ```

2.  **Access the application:**
    Open your browser and navigate to `http://localhost:6514` (or the port you specified in your environment).

3.  **Stopping the application:**
    ```bash
    docker-compose down
    ```

## Manual Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/monrapps/crypterm.git
    ```

2.  **Navigate to the source directory:**
    ```bash
    cd crypterm/src
    ```

3.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

Before running the application, you must configure your exchange keys and assets of interest. The configuration is loaded from two files that you need to create.

### 1. Exchange and API Keys (`keys.local.json`)

This file holds your sensitive API keys. It should be placed in the root directory of the project (one level above `src`).

**Important:** This file is not tracked by Git and should never be shared.

Create a file named `keys.local.json` in the project's root directory with the following structure:

```json
{
    "binance": {
        "apiKey": "YOUR_BINANCE_API_KEY",
        "secret": "YOUR_BINANCE_SECRET"
    },
    "bitfinex": {
        "apiKey": "YOUR_BITFINEX_API_KEY",
        "secret": "YOUR_BITFINEX_SECRET"
    },
    "whalealertio": {
        "api_key": "YOUR_WHALE_ALERT_API_KEY"
    }
}
```

### 2. Assets of Interest (`interests.local.json`)

This file tells the application which cryptocurrencies and pairs to monitor. It should be placed inside the `src` directory.

Create a file named `interests.local.json` in the `src` directory. Here is an example:

```json
{
    "base": [
        "BTC",
        "ETH",
        "SOL",
        "ADA"
    ],
    "quote": [
        "USDT",
        "BRL",
        "BTC"
    ],
    "symbols": [
        "BTC/BRL"
    ],
    "main": "BRL",
    "secondary": "BTC"
}
```
- `base`: The base currencies you are interested in (e.g., BTC in BTC/USDT).
- `quote`: The quote currencies you want to track against (e.g., USDT in BTC/USDT).
- `symbols`: Specific pairs to always include.
- `main`: The primary currency for calculating your total portfolio equity.
- `secondary`: The secondary currency for calculating total equity.

## Usage

Once configured, you can run the application from the `src` directory:

```bash
node index.js
```

### Keybindings

- `q`, `Esc`, `Ctrl+C`: Quit the application.
- `d`: Show the main **Dashboard** layout.
- `t`: Show the expanded **Tickers** layout.
- `c`: Show the expanded **Closed Orders** layout.
- `a`: Toggle the main equity currency (e.g., BRL ↔ USDT).
- `s`: Toggle the secondary equity currency (e.g., USDT ↔ BTC).
- `i`: Invert the sort order in the tickers table.
- `p`: Sort tickers by **percentage change**.
- `v`: Sort tickers by **volume**.
