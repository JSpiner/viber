cask "viber" do
  version "1.0.3"
  sha256 "2ad457b1ea2f6907fff5281cbd7bca7895065f4215153016383f0058449fd88c"

  url "https://github.com/jspiner/viber/releases/download/v#{version}/Viber-#{version}-arm64.dmg"
  name "Viber"
  desc "Claude conversation data analyzer for macOS"
  homepage "https://github.com/jspiner/viber"

  auto_updates false
  depends_on macos: ">= :monterey"
  depends_on arch: :arm64

  app "Viber.app"

  zap trash: [
    "~/Library/Application Support/Viber",
    "~/Library/Preferences/io.jspiner.viber.plist",
    "~/Library/Saved Application State/io.jspiner.viber.savedState",
    "~/Library/Caches/io.jspiner.viber",
    "~/Library/Caches/io.jspiner.viber.ShipIt",
  ]
end