import { describe, it, expect } from "vitest";
import {
  detectCyrillicLang,
  romanizeCyrillic,
  romanizeGreek,
  romanizeHangul,
  romanizeKana,
  romanizeLine,
  romanizeSong,
} from "./extras/romanize";

describe("Cyrillic romanization", () => {
  it("writes Russian in plain Latin letters", () => {
    expect(romanizeCyrillic("Привет, как дела?", "ru")).toBe("Privet, kak dela?");
    expect(romanizeCyrillic("Я тебя люблю", "ru")).toBe("Ya tebya lyublyu");
    expect(romanizeCyrillic("Широка страна моя родная", "ru")).toBe("Shiroka strana moya rodnaya");
    expect(romanizeCyrillic("Ещё щука и подъезд", "ru")).toBe("Eshchyo shchuka i podezd");
    expect(romanizeCyrillic("красивый синий день", "ru")).toBe("krasivy siniy den");
    expect(romanizeCyrillic("Хочу перемен", "ru")).toBe("Khochu peremen");
  });

  it("keeps the case of all-caps words", () => {
    expect(romanizeCyrillic("ЖИЗНЬ", "ru")).toBe("ZHIZN");
    expect(romanizeCyrillic("Жизнь", "ru")).toBe("Zhizn");
  });

  it("uses Ukrainian letter values", () => {
    expect(romanizeCyrillic("Гарна дівчина", "uk")).toBe("Harna divchyna");
    expect(romanizeCyrillic("Їжак з'їв ґудзик", "uk")).toBe("Yizhak zyiv gudzyk");
    expect(romanizeCyrillic("Моє серце", "uk")).toBe("Moye sertse");
  });

  it("handles Belarusian, Bulgarian and Serbian", () => {
    expect(romanizeCyrillic("Беларусь і ўсё", "be")).toBe("Belarus i usyo");
    expect(romanizeCyrillic("Щастие и път", "bg")).toBe("Shtastie i pat");
    expect(romanizeCyrillic("Љубав и ђак", "sr")).toBe("Ljubav i đak");
    expect(romanizeCyrillic("Џеј ћути", "sr")).toBe("Džej ćuti");
  });

  it("detects the language from letters unique to it", () => {
    expect(detectCyrillicLang("Ты моя")).toBe("ru");
    expect(detectCyrillicLang("Ти моя і все")).toBe("uk");
    expect(detectCyrillicLang("Їхати")).toBe("uk");
    expect(detectCyrillicLang("Ўсё і ты")).toBe("be");
    expect(detectCyrillicLang("Љубав")).toBe("sr");
    expect(detectCyrillicLang("Защо съм тук, обещавам")).toBe("bg");
  });
});

describe("Greek romanization", () => {
  it("transliterates common lyrics", () => {
    expect(romanizeGreek("Σ' αγαπώ")).toBe("S' agapo");
    expect(romanizeGreek("Καλημέρα")).toBe("Kalimera");
    expect(romanizeGreek("Ουρανός")).toBe("Ouranos");
    expect(romanizeGreek("θάλασσα και ψυχή")).toBe("thalassa kai psychi");
  });

  it("handles digraphs by position", () => {
    expect(romanizeGreek("μπαμπάς")).toBe("bampas");
    expect(romanizeGreek("ντομάτα")).toBe("domata");
    expect(romanizeGreek("άγγελος")).toBe("angelos");
    expect(romanizeGreek("αυτός ευχαριστώ αύριο")).toBe("aftos efcharisto avrio");
  });
});

describe("Korean romanization", () => {
  it("follows Revised Romanization with sound changes", () => {
    expect(romanizeHangul("사랑해")).toBe("saranghae");
    expect(romanizeHangul("한국어")).toBe("hangugeo");
    expect(romanizeHangul("감사합니다")).toBe("gamsahamnida");
    expect(romanizeHangul("신라")).toBe("silla");
    expect(romanizeHangul("좋아")).toBe("joa");
    expect(romanizeHangul("좋다")).toBe("jota");
    expect(romanizeHangul("않아")).toBe("ana");
    expect(romanizeHangul("읽어")).toBe("ilgeo");
  });

  it("keeps spaces and Latin words", () => {
    expect(romanizeHangul("너를 사랑해 baby")).toBe("neoreul saranghae baby");
  });
});

describe("Japanese kana romanization", () => {
  it("writes hiragana and katakana in Hepburn", () => {
    expect(romanizeKana("ありがとう")).toBe("arigatou");
    expect(romanizeKana("きょうはいい てんき")).toBe("kyouhaii tenki");
    expect(romanizeKana("ちょっと まって")).toBe("chotto matte");
    expect(romanizeKana("コーヒー")).toBe("koohii");
    expect(romanizeKana("ファンタジー")).toBe("fantajii");
    expect(romanizeKana("いっしょに")).toBe("isshoni");
  });
});

describe("romanizeLine / romanizeSong", () => {
  it("returns latin for lines that need nothing", () => {
    expect(romanizeLine("Hello world")).toEqual({ kind: "latin" });
  });

  it("marks Chinese characters and kanji as unsupported", () => {
    expect(romanizeLine("我爱你")).toEqual({ kind: "unsupported" });
    expect(romanizeLine("君の名は")).toEqual({ kind: "unsupported" });
  });

  it("uses the song's Cyrillic language for every line", () => {
    const song = romanizeSong(["Гарна дівчина", "Ти моя", "Ти моя", "", "oh yeah", "我"]);
    expect(song.byText.get("Ти моя")).toBe("Ty moya");
    expect(song.byText.has("oh yeah")).toBe(false);
    expect(song.unsupportedCount).toBe(1);
  });
});
