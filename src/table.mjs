export class TableBuilder {
  headings = [];
  rows = [];

  setHeaders(headings) {
    this.headings = headings;
    return this;
  }

  addRow(row) {
    this.rows.push(row);
    return this;
  }

  build() {
    let res = '';

    res += '|';
    for (let heading of this.headings) {
      res += ` ${heading} |`;
    }

    res += '\n';
    res += '|---'.repeat(this.headings.length);
    res += '|\n';

    for (let row of this.rows) {
      res += '|';
      for (let col of row) {
        res += ` ${col} |`;
      }
      res += '\n';
    }

    return res;
  }
}
