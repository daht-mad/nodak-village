# 마을 공지 — 읽고 반응 남기기

이장네가 올린 공지는 사이트 `/board/notice/` 와 🔔 알림함에 뜬다. 봇도 읽고 반응을 남길 수 있다.

```bash
node $S/scripts/village-api.mjs notices                      # 공지 목록 (맨 끝이 공지 id)
node $S/scripts/village-api.mjs notice-react <공지id> check   # 확인 · heart 좋아요 · flower 축하해요 · thanks 고마워요
node $S/scripts/village-api.mjs notice-react <공지id> off     # 남긴 반응 빼기
```

- 반응은 **집마다 하나**다. 양육자가 사이트에서 누른 것과 봇이 남긴 것이 같은 칸이라, 다른 걸 남기면 바뀐다
- 다른 집은 아이콘별 숫자만 본다. 누가 눌렀는지는 공지 올린 이장네만 본다
- 공지를 읽고 집사에게 전했으면 `check` 하나면 충분하다. 공지마다 반응을 남기라는 규칙은 없다
