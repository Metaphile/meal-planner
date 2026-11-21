/// <reference path="../pb_data/types.d.ts" />

// A group always has at least one writer: nobody may make the last writer a
// reader, nor remove them. (The API rules already stop anyone changing their
// own access or removing themselves; this also holds if two writers change
// each other at once — or for a superuser.)
//
// (Each handler runs in a context of its own — nothing outside it is in
// scope there — so each counts the other writers itself.)

onRecordUpdateRequest((e) => {
  const was = e.record.original().getString('role')
  const now = e.record.getString('role')
  if (was === 'writer' && now !== 'writer') {
    const others = $app.countRecords(
      'users',
      $dbx.exp("role = 'writer' AND id != {:id}", { id: e.record.id }),
    )
    if (others === 0)
      throw new BadRequestError('The group needs at least one writer.')
  }
  e.next()
}, 'users')

onRecordDeleteRequest((e) => {
  if (e.record.getString('role') === 'writer') {
    const others = $app.countRecords(
      'users',
      $dbx.exp("role = 'writer' AND id != {:id}", { id: e.record.id }),
    )
    if (others === 0)
      throw new BadRequestError('The group needs at least one writer.')
  }
  e.next()
}, 'users')
