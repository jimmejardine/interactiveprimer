# Computer Science — planned concept tree (ages 5 → 18)

A road-map of (nearly) every computer-science idea needed to take a learner from age **5** to age
**18**, as a nested tree. It is the master plan for which `concepts/computer-science/**` pages to build.

**How to read it**

- **Nesting (≤5 levels):** Strand → Topic → Sub-topic → Concept → atomic idea. A **leaf** ≈ one
  teachable page ("one small idea per page").
- **Order = prerequisite order**, which is also the rough 5→18 progression.
- **Age bands** (UK-flavoured, "what I'd teach"): *Early* 5–7 · *Primary* 7–11 ·
  *Lower secondary* 11–14 · *GCSE* 14–16 · *A-level* 16–18.
- **No CS pages are built yet** — every leaf is **planned**. When one becomes a page, mark it
  `✓ built: <slug>` (path under `concepts/computer-science/`).
- Early CS is mostly **"unplugged"** (no computer needed): instructions, sequences, sorting.
  Some leaves depend on maths (binary, logic, sets, graphs) in `concepts/mathematics/`.

---

## 1. Computational thinking

### Early–Primary (5–11)
- Algorithms as instructions
  - Giving precise step-by-step instructions
  - Following instructions exactly (the "literal robot")
  - Order matters: sequencing
  - Everyday algorithms (recipes, routines)
- Decomposition
  - Breaking a big problem into smaller parts
- Pattern recognition
  - Spotting things that repeat
- Abstraction
  - Keeping what matters, hiding the detail (maps, symbols)
- Debugging (unplugged)
  - Finding and fixing the mistake in a set of steps

### Lower secondary–A-level (11–18)
- Thinking abstractly
  - Abstraction vs reality; models
  - Inputs, processes, outputs
- Thinking ahead
  - Identifying preconditions; caching/reuse
- Thinking procedurally & logically
  - Decomposition into sub-procedures
  - Logical reasoning about program behaviour
- Thinking concurrently (A-level intro)

---

## 2. Algorithms

### Primary (7–11)
- Representing algorithms
  - Steps in plain language
  - Simple flowcharts
- Repetition and choice (in algorithms)
  - Doing something again (loops)
  - Making a decision (if …)

### Lower secondary–GCSE (11–16)
- Designing algorithms
  - Pseudocode
  - Flowcharts (full set of symbols)
  - Trace tables (dry running)
- Searching
  - Linear search
  - Binary search (and why the list must be sorted)
- Sorting
  - Bubble sort
  - Insertion sort
  - Merge sort
- Correctness & efficiency (intro)
  - Comparing algorithms (steps taken)

### A-level (16–18)
- Complexity
  - Big-O notation; time & space complexity
  - Best/worst/average case
- Data-structure algorithms
  - Stack/queue operations
  - Tree traversals (in/pre/post-order)
  - Graph traversal (breadth-first, depth-first)
  - Shortest path (Dijkstra); A* (intro)
- Recursion
  - Recursive definitions; base & recursive cases
  - Recursion vs iteration; the call stack
- Optimisation & paradigms (divide-and-conquer, greedy, dynamic programming — intro)

---

## 3. Programming

### Early–Primary (5–11)
- Block-based coding
  - Sequencing blocks (ScratchJr / Scratch, floor robots)
  - Loops (repeat) blocks
  - Events (when … then …)
  - Sprites, motion and simple games
- First ideas of data
  - Variables as labelled boxes (intro)

### Lower secondary–GCSE (11–16)
- Moving to text-based programming
  - From blocks to text (e.g. Python)
  - Statements, syntax and running a program
- Core constructs
  - Variables and assignment
  - Data types (integer, real, boolean, string, character)
  - Input and output
  - Arithmetic and operators
  - Selection (if / elif / else)
  - Iteration (count-controlled `for`; condition-controlled `while`)
  - Nested selection/iteration
- Structuring code
  - Subroutines: procedures and functions
  - Parameters and return values
  - Local vs global scope
- Working with data
  - Strings and string manipulation
  - 1-D arrays / lists
  - 2-D arrays
  - Records / dictionaries
  - Reading & writing files
- Quality
  - Reading and tracing code
  - Errors: syntax, logic, runtime
  - Testing (normal, boundary, erroneous data)
  - Debugging techniques

### A-level (16–18)
- Programming paradigms
  - Procedural programming
  - Object-oriented programming (classes, objects, methods, attributes)
  - Inheritance, encapsulation, polymorphism
  - Functional programming (intro)
- Data structures (implementing)
  - Stacks and queues
  - Linked lists
  - Trees and binary search trees
  - Hash tables
  - Graphs
- Robust software
  - Exception handling
  - Modular & maintainable design
  - Version control (intro)

---

## 4. Data representation

### Primary–Lower secondary (7–14)
- Why computers use binary
  - On/off, true/false; bits
  - Bits, nibbles, bytes and units (KB, MB, GB…)
- Numbers
  - Binary numbers; binary ↔ denary
  - Binary addition
  - Hexadecimal; hex ↔ binary ↔ denary
- Text
  - Character sets: ASCII and Unicode

### GCSE–A-level (14–18)
- Numbers (deeper)
  - Binary shifts; overflow
  - Two's complement (negative numbers)
  - Fixed-point and floating-point representation (A-level)
- Media
  - Bitmap images (resolution, colour depth, file size)
  - Sound (sampling rate, bit depth)
- Compression
  - Lossy vs lossless
  - Run-length encoding; Huffman coding (A-level)
- Encoding & checking
  - Parity bits and checksums

---

## 5. Computer systems & architecture

### Primary (7–11)
- What a computer is
  - Inputs, processing, outputs, storage
  - Hardware vs software
  - Common devices and their jobs

### Lower secondary–GCSE (11–16)
- Inside the computer
  - The CPU and its job
  - Memory: RAM vs ROM
  - Secondary storage (magnetic, optical, solid-state)
  - The fetch–decode–execute cycle
  - CPU performance factors (clock speed, cores, cache)
  - The von Neumann architecture
- Software
  - Operating systems and their functions
  - Utility software
  - System vs application software
- Logic
  - Boolean logic; AND, OR, NOT
  - Logic gates and truth tables
  - Combining gates; simple logic circuits

### A-level (16–18)
- Architecture (deeper)
  - Registers; the ALU and control unit
  - Buses (address, data, control)
  - Assembly language & instruction sets; addressing modes
  - Pipelining; alternative architectures (intro)
- Boolean algebra
  - Simplifying expressions; De Morgan's laws
  - Karnaugh maps; adders and flip-flops

---

## 6. Networks & the Internet

### Primary (7–11)
- Connected computers
  - What a network is; sharing and communicating
  - The internet vs the World Wide Web
  - Searching effectively; how search results are ranked (intro)

### Lower secondary–GCSE (11–16)
- Network basics
  - LANs and WANs
  - Network hardware (router, switch, NIC)
  - Wired vs wireless; performance factors
  - Network topologies (star, mesh)
- How data travels
  - Packets and packet switching
  - Protocols and why they matter
  - The TCP/IP and OSI layer models
  - IP addresses, MAC addresses, DNS
- The web
  - Client–server model; HTTP/HTTPS
  - The cloud

### A-level (16–18)
- Networking (deeper)
  - Protocol stacks in detail
  - Routing
  - Network security (firewalls, encryption)
  - The internet of things

---

## 7. Data & databases

### Lower secondary–GCSE (11–16)
- Data vs information
- Structured data
  - Flat files vs relational databases
  - Tables, records, fields and primary keys
  - Relationships and foreign keys
  - Querying data (intro to SQL)

### A-level (16–18)
- Relational databases
  - Entity-relationship modelling
  - Normalisation (1NF, 2NF, 3NF)
  - SQL (SELECT, INSERT, UPDATE, DELETE, JOIN)
  - Transactions (ACID)
- Big data & alternatives
  - Non-relational databases (intro)
  - Data mining and machine learning (intro)

---

## 8. Cyber security

### Primary (7–11)
- Staying safe
  - Strong passwords; keeping personal data private
  - Recognising scams and unkind behaviour online

### Lower secondary–GCSE (11–16)
- Threats
  - Malware (viruses, worms, trojans, ransomware)
  - Phishing and social engineering
  - Brute-force, denial-of-service, SQL injection (intro)
- Protection
  - Authentication; access control
  - Firewalls and antivirus
  - Encryption (intro); penetration testing

### A-level (16–18)
- Encryption & security (deeper)
  - Symmetric vs asymmetric (public-key) encryption
  - Hashing
  - Digital signatures and certificates

---

## 9. Impacts, ethics & digital literacy (5–18, woven throughout)

- Using technology
  - Online safety and digital citizenship
  - Reliable vs unreliable sources
- Wider impacts
  - Ethical, legal, cultural and environmental impacts of technology
  - Privacy and data protection (legislation)
  - Intellectual property; open-source vs proprietary
  - Artificial intelligence: uses, bias and ethics
  - Accessibility and inclusive design

---

## 10. Theory of computation (A-level stretch, 16–18)

- Models of computation
  - Finite state machines (and with output)
  - Regular expressions and languages
  - Turing machines; the universal machine
- Limits of computation
  - Computability; the halting problem
  - Tractable vs intractable problems (P vs NP — intro)
- Maths for CS (cross-link to `concepts/mathematics/`)
  - Number bases; boolean algebra
  - Sets, relations and functions
  - Graphs and trees

---

### Notes & next steps
- **Nothing is built yet.** Natural first pages: *Computational thinking* (algorithms as
  instructions, sequencing, debugging) and the start of *Programming* (block-based), both of which
  need no prior maths.
- **Maths dependencies:** data representation (binary/hex) needs place value & number bases; logic
  needs boolean algebra; algorithms/complexity lean on functions & graphs — link these into
  `concepts/mathematics/`.
- When promoting a leaf to a page, follow `CLAUDE.md`: one idea per page; set `prerequisites` to the
  feeding leaves (including cross-subject maths), and let levels propagate.
