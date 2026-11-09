(() => {
  const MUSIC_KEY = "chloe-marin-music";
  const MUSIC_TIME_KEY = "chloe-marin-music-time";

  const MUSIC_FILE =
    "Alex%20Warren%20-%20Ordinary%20%28Official%20Music%20Video%29.mp3";

  let audio = null;

  function createPlayer() {
    if (document.getElementById("weddingMusic")) {
      return document.getElementById("weddingMusic");
    }

    audio = document.createElement("audio");
    audio.id = "weddingMusic";
    audio.src = MUSIC_FILE;
    audio.preload = "auto";
    audio.loop = true;

    document.body.appendChild(audio);

    return audio;
  }

  function createButton() {
    if (document.getElementById("musicButton")) return;

    const button = document.createElement("button");

    button.id = "musicButton";
    button.type = "button";
    button.textContent = "🎵";
    button.title = "Musique";

    button.style.position = "fixed";
    button.style.right = "18px";
    button.style.bottom = "18px";
    button.style.zIndex = "9999";
    button.style.width = "48px";
    button.style.height = "48px";
    button.style.borderRadius = "50%";
    button.style.border = "1px solid rgba(0,0,0,.12)";
    button.style.background = "rgba(255,255,255,.92)";
    button.style.boxShadow = "0 4px 15px rgba(0,0,0,.15)";
    button.style.fontSize = "20px";
    button.style.cursor = "pointer";

    button.addEventListener("click", async () => {
      const player = createPlayer();

      if (player.paused) {
        try {
          await player.play();
          localStorage.setItem(MUSIC_KEY, "playing");
          button.textContent = "🔊";
        } catch (error) {
          console.log("Impossible de lancer la musique :", error);
        }
      } else {
        player.pause();
        localStorage.setItem(MUSIC_KEY, "paused");
        button.textContent = "🔇";
      }
    });

    document.body.appendChild(button);
  }

  async function startMusic() {
    const player = createPlayer();

    const savedTime = parseFloat(
      localStorage.getItem(MUSIC_TIME_KEY) || "0"
    );

    if (!isNaN(savedTime)) {
      try {
        player.currentTime = savedTime;
      } catch (error) {}
    }

    const state = localStorage.getItem(MUSIC_KEY);

    if (state === "playing") {
      try {
        await player.play();
      } catch (error) {
        console.log(
          "Lecture automatique bloquée par le navigateur."
        );
      }
    }

    updateButton();
  }

  function updateButton() {
    const button = document.getElementById("musicButton");
    const player = document.getElementById("weddingMusic");

    if (!button || !player) return;

    button.textContent = player.paused ? "🔇" : "🔊";
  }

  function savePosition() {
    const player = document.getElementById("weddingMusic");

    if (!player) return;

    localStorage.setItem(
      MUSIC_TIME_KEY,
      String(player.currentTime)
    );
  }

  window.addEventListener("beforeunload", savePosition);

  document.addEventListener("DOMContentLoaded", () => {
    createPlayer();
    createButton();
    startMusic();
  });
})();
