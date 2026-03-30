function doGet(e) {
  try {
    const spreadsheetId = '15jecJzOZm_TG6w9Le4gLysJzQy9NLAWhEDzgR7sLhME';
    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheets()[0]; // Getting the first sheet
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const headers = data[0].map(h => h.toString().toLowerCase().replace(/ /g, '_'));
    const jsonArray = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const rowObject = {};
        for (let j = 0; j < headers.length; j++) {
            let value = row[j];
            // Format dates properly
            if (value instanceof Date) {
               value = Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
            }
            rowObject[headers[j]] = value;
        }
        jsonArray.push(rowObject);
    }

    // Set CORS headers allowing any domain
    const output = ContentService.createTextOutput(JSON.stringify(jsonArray))
      .setMimeType(ContentService.MimeType.JSON);

    return output;

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
