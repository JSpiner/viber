# Viber
![viber_image](images/viber_image.png)
![viber_logo](images/viber_logo.png)

A macOS desktop application for analyzing and monitoring Claude conversation data with real-time token usage tracking.


## Features

- **Real-time Monitoring**: Track your Claude token usage in real-time with automatic updates every 30 seconds
- **Usage Analytics**: View detailed statistics of your token consumption over time
- **Multi-tier Support**: Supports Pro ($20/month), Max 5x ($100/month), and Max 20x ($200/month) subscription tiers
- **Session Logs**: Browse through your conversation history with detailed metrics
- **Dark Mode**: Beautiful dark-themed UI designed specifically for macOS
- **Token Limits**: Monitor 5-hour and weekly token windows with visual progress indicators
- **Cost Tracking**: Track estimated costs based on your usage patterns with accurate Claude pricing
- **Cache Savings**: See how much you save with Claude's caching feature

## Screenshots
TBD

## Requirements

- macOS 10.13 or later
- Node.js 18.0 or later
- npm or yarn
- Access to `~/.claude/projects/` directory

## Installation

### Option 1: Download Pre-built Release

1. Go to the [Releases](https://github.com/yourusername/viber/releases) page
2. Download the `.dmg` file for your architecture (Intel or Apple Silicon)
3. Open the DMG and drag Viber to your Applications folder

### Option 2: Build from Source

1. Clone the repository:
```bash
git clone https://github.com/yourusername/viber.git
cd viber
```

2. Install dependencies:
```bash
npm install
```

3. Run in development mode:
```bash
npm start
```

## Building

### For Development
```bash
npm start
```

### For Production

Build for macOS (creates both .dmg and .zip):
```bash
npm run dist
```

Build only DMG:
```bash
npm run dist:dmg
```

Build only ZIP:
```bash
npm run dist:zip
```

The built applications will be in the `dist/` directory.

## Usage

1. **Launch the application** using `npm start` or by opening the installed app
2. **Select your subscription tier** in the Now tab (Pro, Max 5x, or Max 20x)
3. **Monitor real-time usage** in the Now tab with automatic updates
4. **View historical data** in the Statistics tab with daily or session views
5. **Configure settings** in the Settings tab (status bar display, alerts, etc.)

The app automatically scans `~/.claude/projects/` for JSONL conversation files.

## Development

### Project Structure
```
viber/
├── main.js              # Main process entry point
├── renderer.js          # Renderer process and tab navigation
├── index.html           # Main UI structure
├── styles.css           # Application styles
├── now.js              # Real-time monitoring logic
├── statistics.js       # Statistics tab functionality
├── settings.js         # Settings management
├── services/
│   ├── jsonl-parser.js # JSONL file parsing
│   └── aggregator.js   # Token usage aggregation
└── resources/          # Application resources
    └── icon.png        # Application icon
```

### Key Technologies
- **Electron**: Cross-platform desktop application framework
- **Chart.js**: Data visualization for usage charts
- **electron-store**: Persistent settings storage

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Pricing Configuration

The app uses the following Claude pricing (per 1K tokens):

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Claude Opus 4 | $0.015 | $0.075 | $0.01875 | $0.0015 |
| Claude Sonnet 4 | $0.003 | $0.015 | $0.00375 | $0.0003 |
| Claude Haiku 3 | $0.00025 | $0.00125 | $0.0003 | $0.00003 |

## Configuration

Viber stores its configuration in:
- **macOS**: `~/Library/Application Support/viber/`

Settings include:
- Selected subscription tier
- Status bar preferences
- Alert thresholds
- Update frequency

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR
- Test on both Intel and Apple Silicon Macs if possible

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Charts powered by [Chart.js](https://www.chartjs.org/)
- Inspired by the need for better Claude usage analytics

## Support

If you encounter any issues or have questions:
- Open an issue on [GitHub Issues](https://github.com/yourusername/viber/issues)
- Check existing issues before creating a new one
- Include your macOS version and architecture (Intel/Apple Silicon) in bug reports

---

Made with ❤️ for the Claude community