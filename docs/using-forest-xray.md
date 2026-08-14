# Forest X-Ray, explained simply

Forest X-Ray is a tiny “peek inside the forest” tool. It uses real NASA GEDI
laser measurements from the International Space Station to show how a patch of
forest is arranged from the ground up.

It does not take a normal camera picture. It does not identify every tree or
draw a perfect 3D model. One measurement is a small circle on the ground that
can include many trees.

## What NASA measured

GEDI sends short laser pulses down at the forest. Some light bounces off the
top leaves, some bounces off branches and leaves lower down, and some reaches
the ground. The returning light makes a signal called a **waveform**.

Think of the waveform like an echo. A bump means the laser saw more stuff at
that part of the forest’s height. The signal is measured in digital numbers,
so a bigger bump means a stronger return, not “more trees” by itself.

## What the words mean

- **Footprint:** One roughly 25-meter-wide laser spot. It is a small sample of
  the forest, not the whole park.
- **Waveform:** The full up-and-down record of returned laser energy. It helps
  show where leaves, branches, and ground are stacked vertically.
- **RH50:** The height where the middle of the measured return energy occurs,
  measured from the ground. It is a useful “middle of the canopy” number.
- **RH100:** The highest detected relative height in that footprint. It is a
  clue about the tallest return, not a guaranteed tallest tree.
- **Cover:** How leafy that 25-meter circle looks. Near 98% means canopy
  across most of the spotlight.
- **Ground:** The land elevation. Forest X-Ray uses a USGS lookup for the
  displayed terrain value.
- **Joined / high quality:** The same footprint was matched across the GEDI
  waveform, height, and canopy products, and it passed the quality checks used
  by this demo.

## How to use it

1. **Pick a glowing column** or a row in the pulse list. Each one is a 25-meter
   spotlight from the ISS — about a tennis court, not one tree.
2. **Read the stack.** Canopy top is the highest bounce. How leafy is how much
   of that circle has canopy. Ground is the land. RH100 / RH50 are the science
   names sitting under those labels.
3. **Hover the leafy chart** to slice the forest at a height. Watch the stack
   and the 3D pulse follow. Use Next or `j` / `k` to walk along the orbit.
4. **Share a link.** The URL keeps `?shot=` and, in compare, `?a=` and `?b=`.
5. **Compare.** Three curated pairs, or any two pulses. The sentences are
   rule-based, not AI guesses.
6. **Fire replay** is a historical demo, not a live warning.

## How to read one result

If a footprint says **RH100 = 100.9 m**, the highest measured return in that
spot is about 101 meters above its ground reference. If it says **Cover =
97.8%**, canopy was estimated across most of the footprint. Together, those
numbers suggest a tall, densely covered patch, but they do not prove that one
tree is exactly 101 meters tall.

The “Traceability” section links to the NASA and USGS sources. The footer says
“static NASA-derived fixture” because this local demo reads a prepared proof
bundle. It does not send your browser credentials to NASA.

Learn more: [NASA GEDI products](https://gedi.umd.edu/dataproducts/products/),
[NASA GEDI Data Resources](https://github.com/nasa/GEDI-Data-Resources), and
[USGS 3DEP elevation service](https://epqs.nationalmap.gov/v1/docs).
