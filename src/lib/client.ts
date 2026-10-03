const TOKEN_KEY = "corridor:player";

// Анонімний ідентифікатор браузера: за ним сервер упізнає гравця після перезавантаження сторінки.
// getRandomValues, а не randomUUID — бо той недоступний по http з локальної мережі.
export function getPlayerToken() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
