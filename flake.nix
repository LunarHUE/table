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
        in
        {
          default = pkgs.mkShellNoCC {
            # Add the tools this repo needs, e.g. pkgs.go or pkgs.nodejs.
            packages = [ ];
          };
        }
      );
    };
}
