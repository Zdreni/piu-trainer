// EDIT ME: table of levels. Each key is a level number (as a string).
// scores: desired score for each successive attempt at that level
// (first element = first try; if you fail, the next element becomes
// the new target; the last element repeats if you keep failing it).
// A level can omit any field (or be skipped entirely) to inherit it from
// the nearest lower level that specifies it. The lowest level in the
// table has nothing to inherit from, so it must specify scores,
// avSingles, and avDoubles explicitly.
var LEVEL_DATA = {
  "10": { "scores": [996, 992, 988, 984, 980],  "avSingles": 651, "avDoubles": 631 },

  "16": { "scores": [995, 990, 985, 980, 975],  "avSingles": 656, "avDoubles": 636,  },
  "17": { "scores": [994, 989, 984, 979, 974] },
  "18": { "scores": [993, 988, 983, 978, 973] },

  "19": { "scores": [992, 987, 982, 977, 972],  "avSingles": 661, "avDoubles": 641 },
  "20": { "scores": [991, 986, 981, 976, 971] },
  "21": { "scores": [990, 985, 980, 975, 970] },

  "22": { "scores": [989, 984, 979, 974, 969],  "avSingles": 665, "avDoubles": 643 },
  "23": { "scores": [988, 983, 978, 973, 968] },
  "24": { "scores": [987, 982, 977, 972, 967] },

  "25": { "scores": [986, 981, 976, 971, 966, 961],               "avDoubles": 645 },
  "26": { "scores": [985, 980, 975, 970, 965, 960] }
};
