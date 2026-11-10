"""English Misaki G2P: en-US is eager, en-GB/en-UK is lazy."""
from functools import lru_cache

from misaki import en, espeak


@lru_cache(maxsize=2)
def _g2p(british: bool) -> en.G2P:
    return en.G2P(
        trf=False,
        british=british,
        fallback=espeak.EspeakFallback(british=british),
    )


# Pay the en-US spaCy/lexicon startup cost with the server, not on its first request.
_g2p(False)


def phonemize(text: str, lang: str = "en-us") -> str:
    """Phonemize English, loading the British pipeline only when first requested."""
    lang = lang.lower().replace("_", "-")
    if lang == "en-uk":
        lang = "en-gb"
    if lang not in ("en-us", "en-gb"):
        raise ValueError(f"Misaki English supports en-us and en-gb/en-uk, not {lang}")
    phonemes, _tokens = _g2p(lang == "en-gb")(text)
    return phonemes
