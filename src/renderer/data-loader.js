window.MoGugeoData = {
  ready: null,
  sentences: [],
  words: [],
  expressions: [],
  meta: null,
};

function loadJsonWithXhr(url) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "text";
    request.onload = () => {
      if (request.status >= 200 && request.status < 300 || request.status === 0) {
        try {
          resolve(JSON.parse(request.responseText));
        } catch (error) {
          reject(error);
        }
        return;
      }
      reject(new Error(`XHR failed for ${url} with status ${request.status}`));
    };
    request.onerror = () => reject(new Error(`XHR network failure for ${url}`));
    request.send();
  });
}

async function loadJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch failed for ${url} with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("MoGugeoData fetch fallback activated.", error);
    if (window.location.protocol === "file:") {
      return loadJsonWithXhr(url);
    }
    throw error;
  }
}

window.MoGugeoData.ready = (async () => {
  const base = new URL("../data/", document.baseURI).href;
  const [sentences, words, expressions, meta] = await Promise.all([
    loadJson(`${base}sentences.json`),
    loadJson(`${base}words.json`),
    loadJson(`${base}expressions.json`),
    loadJson(`${base}meta.json`),
  ]);

  window.MoGugeoData.sentences = sentences;
  window.MoGugeoData.words = words;
  window.MoGugeoData.expressions = expressions;
  window.MoGugeoData.meta = meta;
})().catch((error) => {
  console.error("MoGugeoData could not be loaded.", error);
  throw error;
});
