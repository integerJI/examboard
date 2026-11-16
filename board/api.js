'use strict';
/* 화면이 데이터를 읽는 유일한 통로. 정적 JSON(data/v1)을 읽는다.
   나중에 서버를 붙이면 BASE 만 '/api/v1/' 로 바꾸면 된다. */
const API = (() => {
  const BASE = '../data/v1/';
  const memo = new Map();
  async function get(path) {
    if (!memo.has(path)) {
      memo.set(path, fetch(BASE + path, {cache: 'no-store'}).then(r => {
        if (!r.ok) throw new Error(`${path} HTTP ${r.status}`);
        return r.json();
      }).then(j => {
        if (j.apiVersion !== '1') throw new Error(`${path}: apiVersion ${j.apiVersion}`);
        return j.data;
      }).catch(e => { memo.delete(path); throw e; }));
    }
    return memo.get(path);
  }
  return {
    index: () => get('index.json'),
    summary: () => get('summary.json'),
    schedule: () => get('schedule.json'),
    sources: () => get('sources.json'),
    exam: id => get(`exams/${encodeURIComponent(id)}.json`),
    guide: id => get(`guides/${encodeURIComponent(id)}.json`),
  };
})();
