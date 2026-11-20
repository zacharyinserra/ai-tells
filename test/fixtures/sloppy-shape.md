# Release checklist

## Why use a release checklist?

A release checklist is useful because it keeps every release consistent. It catches problems early. It also helps new people learn the process quickly.

- Run the tests
- Tag the commit
- Publish the notes

## Before the release

The team freezes the main branch two days before each release. It reviews every open pull request. It merges only fixes for bugs found in testing.

- Update the changelog
- Bump the version
- Check the docs

## During the release

The release lead runs the publish script from a clean checkout. It builds every package. It uploads the artifacts to the registry and checks them.

- Watch the dashboards
- Answer questions
- Post the announcement

## After the release

The team watches error rates for the first two days after shipping. It fixes regressions in a patch release. It writes a short review of what went wrong.

- Close the milestone
- Archive the branch
- Thank the contributors

## Rolling back

The release lead decides on a rollback within the first hour of shipping. It reverts the tag first. It republishes the previous version and tells the support team.

It keeps releases calm. It keeps users happy. What do you think, and what does your team put on its release checklist?
