"""Development / default Pelican settings for touhou-site."""

AUTHOR = "hblow"
SITENAME = "Celestial Peak"
SITESUBTITLE = "A personal shrine to the Touhou Project"
SITEURL = ""
RELATIVE_URLS = True

PATH = "content"
THEME = "theme"
THEME_STATIC_PATHS = ["static"]
THEME_STATIC_DIR = "theme"

TIMEZONE = "America/New_York"
DEFAULT_LANG = "en"

# Content layout
ARTICLE_PATHS = ["characters", "media", "artists", "music"]
PAGE_PATHS = ["pages"]
STATIC_PATHS = ["images"]

ARTICLE_URL = "articles/{slug}.html"
ARTICLE_SAVE_AS = "articles/{slug}.html"
PAGE_URL = "pages/{slug}.html"
PAGE_SAVE_AS = "pages/{slug}.html"

# Suppress blog chrome — single-page landing only
CATEGORY_SAVE_AS = ""
CATEGORY_URL = ""
TAG_SAVE_AS = ""
TAG_URL = ""
AUTHOR_SAVE_AS = ""
AUTHOR_URL = ""
ARCHIVES_SAVE_AS = ""
YEAR_ARCHIVE_SAVE_AS = ""
MONTH_ARCHIVE_SAVE_AS = ""
DAY_ARCHIVE_SAVE_AS = ""
AUTHORS_SAVE_AS = ""
CATEGORIES_SAVE_AS = ""
TAGS_SAVE_AS = ""

DIRECT_TEMPLATES = ["index"]
PAGINATED_TEMPLATES = {}
DEFAULT_PAGINATION = False

# Feeds off until a blog exists
FEED_ALL_ATOM = None
CATEGORY_FEED_ATOM = None
TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = None
AUTHOR_FEED_RSS = None

# Theme-facing settings
SITE_TAGLINE = "A personal shrine to the Touhou Project"
CLOUDS_INTRO = True
TOP_CHARACTERS_LIMIT = 5
GITHUB_REPO = "https://github.com/hblow/touhou-site"
FAN_GUIDELINES_URL = "https://touhou-project.news/"

DEFAULT_DATE_FORMAT = "%Y-%m-%d"
