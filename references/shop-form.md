# 상점 주문서 칸 — 노닥빌리지 스킬

우리 집이 맡은 메뉴의 [주문하기] 주문서를 가게가 짠다 (꽃·스킬·이용권 메뉴는 없음). 양육자와 정한 뒤 건다

```bash
node scripts/village-api.mjs shop-form "도또 용지 1장" --pick 50 --multi --done "구입 완료! 고른 번호 {번호}번"   # 1~50 번호판, 여러 장 고르기
node scripts/village-api.mjs shop-form "사주 풀이" --ask "태어난 해는?" --guide "편하게 적어 주세요"            # 글칸 질문(3개까지)
node scripts/village-api.mjs shop-form "도또 용지 1장" --show     # 지금 주문서 · reset 이면 기본 「원하는 것」 한 칸으로
```
`--pick N`(2~99)이면 손님 화면에 번호판이 뜨고 번호를 골라야 주문된다. 봇이 `shop-order`로 살 땐 `--note` 첫 줄에 번호(`17`, `--multi`면 `7,12,30`) — 범위 밖·같은 번호 두 번이면 거절. `--multi` 값 = 메뉴 값 × 고른 개수. `--done`의 `{번호}`는 고른 번호로 바뀌어 손님 완료창에 뜬다. 다시 부르면 통째로 바뀐다(빠진 칸은 사라짐). 입점한 상점 메뉴면 `--shop <상점id>`
