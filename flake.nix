{
  description = "table development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  # Only a devShell. The repo pod runs `nix develop` from it and gets
  # substituters and trusted keys from NIX_CONFIG, so there's no nixConfig here.
  outputs =
    { nixpkgs, ... }:
    let
      forAllSystems = nixpkgs.lib.genAttrs [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          # bun installs and runs scripts. node runs the tools themselves
          # (tsdown, vitest, size-limit), since the packages use no bun runtime features.
          basePackages = [
            pkgs.bun
            pkgs.nodejs_24
          ];
        in
        {
          default = pkgs.mkShellNoCC {
            packages = basePackages;
          };

          # Opt-in FHS shell for running the browser e2e suite on Nix without pulling
          # Playwright deps into the default shell (Coder repo pods already provide
          # Playwright's system libraries). Using an FHS env lets `bunx playwright install`
          # work for any @playwright/test version without coupling to nixpkgs revisions.
          e2e =
            (pkgs.buildFHSEnv {
              name = "table-e2e";
              targetPkgs =
                p:
                basePackages
                ++ (with p; [
                  # Chromium
                  alsa-lib
                  at-spi2-atk
                  at-spi2-core
                  cairo
                  cups
                  dbus
                  expat
                  fontconfig
                  freetype
                  glib
                  libdrm
                  libgbm
                  libx11
                  libxcb
                  libxcomposite
                  libxdamage
                  libxext
                  libxfixes
                  libxkbcommon
                  libxrandr
                  nspr
                  nss
                  pango
                  systemd

                  # Firefox
                  dbus-glib
                  ffmpeg
                  gdk-pixbuf
                  gtk3
                  harfbuzz
                  libxcursor
                  libxi
                  libxrender
                  libxtst

                  # WebKit
                  enchant
                  gst_all_1.gst-libav
                  gst_all_1.gst-plugins-bad
                  gst_all_1.gst-plugins-base
                  gst_all_1.gst-plugins-good
                  gst_all_1.gstreamer
                  gtk4
                  hyphen
                  icu
                  lcms2
                  libGL
                  libavif
                  libepoxy
                  libevdev
                  libevent
                  libgudev
                  libjpeg
                  libmanette
                  libnotify
                  libopus
                  libpng
                  libproxy
                  libsecret
                  libsoup_3
                  libwebp
                  libxml2
                  libxslt
                  openjpeg
                  wayland
                  woff2

                  # Fonts
                  dejavu_fonts
                  liberation_ttf
                  noto-fonts-color-emoji
                ]);
              profile = ''
                export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
              '';
            }).env;
        }
      );
    };
}
