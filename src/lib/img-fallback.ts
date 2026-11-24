// Reliable images (owner's UX review, 2026-11-24, P1 15: "two guide thumbnails were blank on first load … fall back to a
// placeholder"). One listener for every <img> on the page, inline in <head> so it is there before the first image fails:
// a failed image is tried once more after 1.5 s (a store CDN's blip), then shows the site mark, faded and contained, instead
// of an empty box. A <picture>'s <source> rows are dropped first, or the browser would keep choosing the broken one. It never
// changes an image that loaded, and an image marked data-no-fallback is left alone.
export const IMG_FALLBACK_SRC = "/logo-r.png";

export const IMG_FALLBACK_SCRIPT = `document.addEventListener("error",function(e){var t=e.target;if(!t||t.tagName!=="IMG"||t.hasAttribute("data-no-fallback"))return;if(!t.dataset.retried){t.dataset.retried="1";setTimeout(function(){var s=t.getAttribute("src");if(s){t.removeAttribute("src");t.setAttribute("src",s)}},1500);return}if(t.dataset.fallback)return;t.dataset.fallback="1";var p=t.parentElement;if(p&&p.tagName==="PICTURE"){var ss=p.querySelectorAll("source");for(var i=0;i<ss.length;i++)ss[i].remove()}t.removeAttribute("srcset");t.style.objectFit="contain";t.style.opacity="0.3";t.src=${JSON.stringify(IMG_FALLBACK_SRC)}},true);`;
