# SBF-safe dependency pins (Solana 2.1.0 platform-tools Cargo / rustc ~1.79)
# Re-run after `cargo update` / adding Anchor SPL deps:
#
#   cargo update -p blake3 --precise 1.5.5
#   cargo update -p indexmap@2.14.2 --precise 2.6.0
#   cargo update -p zeroize_derive --precise 1.4.2
#   cargo update -p unicode-segmentation --precise 1.12.0
#
# Avoids crates that require Cargo edition2024 or rustc > 1.79.
