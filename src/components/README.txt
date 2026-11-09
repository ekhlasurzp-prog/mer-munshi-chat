GeminiPane.tsx — সংশোধিত কম্পোনেন্ট

যে পরিবর্তনগুলো করা হয়েছে:
1. FormEvent-কে type-only import করা হয়েছে; TypeScript-এর verbatimModuleSyntax সেটিংয়ে সম্ভাব্য import error এড়াতে।
2. SVG gradient-এর স্থির ID-এর বদলে React useId() ব্যবহার করা হয়েছে; একই পেজে একাধিক GeminiPane/Spark থাকলে ID collision এড়াতে।
3. ইনপুটে type="text" স্পষ্টভাবে যোগ করা হয়েছে।

গুরুত্বপূর্ণ সীমাবদ্ধতা:
আপলোডে শুধু GeminiPane.tsx ফাইলটি পাওয়া গেছে, সম্পূর্ণ ZIP/প্রজেক্ট নয়। তাই ../lib/ai, অন্যান্য কম্পোনেন্ট, package.json, TypeScript config এবং build environment পরীক্ষা করা যায়নি।
ফাইলটি আগের প্রকল্পের একই অবস্থানে বসাতে হবে, যাতে ../lib/ai import path ঠিক থাকে। সম্পূর্ণ প্রজেক্ট ZIP দিলে পুরো অ্যাপ build করে বাকি error-ও সংশোধন করা যাবে।
