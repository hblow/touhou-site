"""Production settings for GitHub Pages (project site)."""

import os
import sys

sys.path.append(os.curdir)
from pelicanconf import *  # noqa: E402, F403

# No trailing slash
SITEURL = "https://hblow.github.io/touhou-site"
RELATIVE_URLS = False

FEED_DOMAIN = SITEURL
DELETE_OUTPUT_DIRECTORY = True
