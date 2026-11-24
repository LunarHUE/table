# table



## Working on it

In a LunarHUE workspace this repo is checked out at `~/repos/table` and runs
in its own pod.

- **Shell in the pod:** `ssh table.<workspace>.repos` from your machine, or
  `ws attach table` in the workspace.
- **Long-running commands** (dev servers, watchers):
  `ws run table --name dev --wait-port <port> -- <command>`, then
  `ws ps`, `ws logs table dev` and `ws stop table dev`.
- **Dev environment:** `flake.nix` defines it. The pod enters its default
  devShell for every command. Add tools to `packages` there and commit
  `flake.lock`.
- **One-off commands from the parent:**
  `ws-route table <dir> -- <command>` runs a command in the pod at
  `/workspace/<dir>` (`.` for the root), with the dev environment loaded.
- **Outside Coder:** `.devcontainer/devcontainer.json` opens the repo in the
  same image the pod uses. Run `docker login ghcr.io` first; the image is
  private.
