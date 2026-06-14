# Interactive Primer - interactiveprimer.com

## Overview

Welcome to the Interactive Primer. It is an open-source collection of "smart web
pages" that teaches the entirety of mathematics, physics and computer science from
the age of 3 to 103. It starts with age-appropriate concepts, slowly working through
a tree of knowledge of increasingly difficult ideas. For the keenest of learners it
will cover the most advanced topics in these three subjects (beyond PhD level). The
primer keeps track of your progress, both through "self-attested" confidence on each
concept's page, and via randomly generated "multiple choice test" pages.

The project takes its spirit from the "Young Lady's Illustrated Primer" of Neal
Stephenson's *The Diamond Age*: a patient, adaptive tutor that meets each learner
where they are and carries them as far as their curiosity will go.

## The tree of knowledge

The tree of knowledge describes every single concept that can be learned through the
Interactive Primer. Starting at the root, it subdivides indefinitely into appropriate
sub-branches, beginning with the most simple concepts imaginable. The higher one
ascends the tree, the broader and deeper one's understanding becomes.

Each sub-branch obviously depends on its parent branches, but sub-branches can also
refer to other sub-branches that are necessary prerequisites for their concepts.
Because branches can point across the tree to one another like this, the structure is
— technically — a Directed Acyclic Graph (DAG). But "DAG" is jargon, so throughout the
Primer we simply call it the **tree**.

To make these dependencies concrete, **every concept page lists the nodes it has as
prerequisites**. Before a page's concept can be tackled, its prerequisite pages should
already be understood.

## The levels of knowledge

As one rises higher up the tree, sub-branches might rely on entire collections of other
sub-branches. To keep this navigable, a concept page **may** state the "level" it belongs
to. A level roughly equates to a stage of education — an early school-age band, a later
school-age band, an undergraduate university level, and so on up to the most advanced
research-level material.

A page is not required to declare a level. But when a page **does** declare one, that
level flows downstream through the tree: every later concept that depends on it (directly
or indirectly) is implicitly elevated to at least that level. In this way a handful of
deliberately levelled "milestone" concepts is enough to give the whole tree a sense of
altitude, without having to label every single page by hand.

Levels give learners that sense of altitude: before starting concepts at a given level,
one should be comfortable with the concepts of the levels below it.
