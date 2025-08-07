# Viber
![viber_image](images/viber_image.png)
![viber_logo](images/viber_logo.png)

![hits](https://hits.sh/github.com/jspiner-viber/hits.svg)

A macOS desktop application for analyzing and monitoring Claude conversation data with real-time token usage tracking.

[Viber Install Guide](#Installation)


## Features

- **Real-time Monitoring**: Track your Claude token usage in real-time with automatic updates every 30 seconds
- **Usage Analytics**: View detailed statistics of your token consumption over time
- **Multi-tier Support**: Supports Pro ($20/month), Max 5x ($100/month), and Max 20x ($200/month) subscription tiers
- **Session Logs**: Browse through your conversation history with detailed metrics
- **Dark Mode**: Beautiful dark-themed UI designed specifically for macOS
- **Token Limits**: Monitor 5-hour and weekly token windows with visual progress indicators
- **Cost Tracking**: Track estimated costs based on your usage patterns with accurate Claude pricing
- **Cache Savings**: See how much you save with Claude's caching feature
- **Status Bar Integration**: Optional macOS status bar icon showing current usage
- **Real-time Alerts**: Get notified when approaching token limits
- **Session Analysis**: View per-session token usage, costs, and cache efficiency
- **Hooks Support**: Extensible hook system for custom integrations and workflows

## Screenshots

### Now Tab - Real-time Monitoring
![now_tab](/images/app_now_1.png)
![now_tab](/images/app_now_2.png)

Track your Claude token usage in real-time with visual progress indicators and automatic updates.

### Statistics Tab - Usage Analytics
![statistics_tab](/images/app_stastics_1.png)
![statistics_tab](/images/app_stastics_2.png)
![statistics_tab](/images/app_stastics_3.png)

View detailed charts and analytics of your token consumption patterns over time.

### Session Log Tab - Conversation History
![session_log_tab](/images/app_session_log.png)

Browse through your past conversations with detailed metrics and search functionality.

### Agents Tab - Claude Agents
![agents_tab](/images/app_agent.png)
Manage agents

### Hooks - Claude Notification
![hooks_tab](/images/app_hooks.png)
Manage claude job done notification.
Set up custom hooks to integrate Viber with your workflows and automation tools.

### Settings Tab - Configuration
![settings_tab](/images/app_settings.png)

Configure your subscription tier, alerts, and application preferences.

### Status Bar Integration
![status_bar](/images/app_status_bar.png)

Optional macOS status bar icon showing your current usage at a glance.

## Requirements

- macOS 10.13 or later
- Node.js 18.0 or later
- npm or yarn
- Access to `~/.claude/projects/` directory

# Installation

### Option 1: Download Pre-built Release (Recommended)

#### English Instructions

1. **Download the App**
   - Go to the [Releases](https://github.com/JSpiner/viber/releases) page
   - Download the latest `.zip` file for your Mac architecture (Intel or Apple Silicon)

2. **Extract and Run**
   - Extract the downloaded ZIP file
   - Double-click the `Viber.app` to launch

3. **Handle Security Warning (macOS Gatekeeper)**
   - On modern macOS versions, you may see an "Untrusted App" security warning
   - **Don't panic!** This is normal for apps not distributed through the App Store
   - Close the warning dialog
   - Go to **System Preferences/Settings** → **Privacy & Security**
   - Scroll down to the **Security** section
   - You'll see a message about Viber being blocked - click **"Allow Anyway"** or **"Open Anyway"**
   - Try launching Viber again - it should now open successfully

#### 한국어 설치 가이드

1. **앱 다운로드**
   - [Releases](https://github.com/JSpiner/viber/releases) 페이지로 이동
   - 최신 `.zip` 파일을 다운로드 (Intel 또는 Apple Silicon 맥 아키텍처에 맞게)

2. **압축 해제 및 실행**
   - 다운로드한 ZIP 파일의 압축을 해제
   - `Viber.app`을 더블클릭하여 실행

3. **보안 경고 처리 (macOS 게이트키퍼)**
   - 최신 macOS에서는 "신뢰할 수 없는 앱"이라는 보안 경고가 나타날 수 있습니다
   - **당황하지 마세요!** 앱스토어를 통해 배포되지 않은 앱에서는 정상적인 현상입니다
   - 경고 팝업을 닫습니다
   - **시스템 환경설정/설정** → **개인정보 보호 및 보안**으로 이동
   - 하단으로 스크롤하여 **보안** 섹션을 찾습니다
   - Viber가 차단되었다는 메시지가 보이면 **"확인 없이 열기"** 또는 **"열기"** 버튼을 클릭
   - Viber를 다시 실행하면 정상적으로 열립니다

### Option 2: Build from Source (For Developers)

1. Clone the repository:
```bash
git clone https://github.com/JSpiner/viber.git
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

## Development

### Key Technologies
- **Electron**: Cross-platform desktop application framework
- **Chart.js**: Data visualization for usage charts
- **electron-store**: Persistent settings storage
- **Jest**: Testing framework for unit and integration tests
- **Canvas API**: Dynamic status bar icon generation

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
- Status bar preferences (visibility, icon style)
- Alert thresholds (percentage-based warnings)
- Update frequency
- Notification preferences
- Hook configurations

### Hooks System

Viber supports a powerful hooks system for custom integrations:

- **usage-update**: Triggered when token usage updates
- **limit-warning**: Triggered when approaching token limits
- **session-complete**: Triggered when a Claude session ends
- **daily-reset**: Triggered at daily reset times

Hooks can execute shell commands with access to usage data via environment variables.

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
- Open an issue on [GitHub Issues](https://github.com/JSpiner/viber/issues)
- Check existing issues before creating a new one
- Include your macOS version and architecture (Intel/Apple Silicon) in bug reports

---

Made with ❤️ for the Claude community
