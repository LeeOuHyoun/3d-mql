param(
  [string]$Login = '',
  [string]$Query = 'list vault;',
  [string]$Out = (Join-Path (Get-Location) 'mql-probe-result.txt')
)

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

public class MqlProbe {
  static readonly Regex Prompt = new Regex(@"MQL<\d*>");
  static readonly Regex Secret = new Regex(@"(\bpassword\s+)('[^']*'|""[^""]*""|[^\s;'""]+)", RegexOptions.IgnoreCase);
  readonly Stopwatch clock = Stopwatch.StartNew();
  readonly object gate = new object();
  readonly List<string> events = new List<string>();
  readonly List<string> lines = new List<string>();
  readonly StringBuilder partial = new StringBuilder();
  readonly List<string> summary = new List<string>();
  Process proc;
  string marker;
  long lastEventAt;

  long Now() { return clock.ElapsedMilliseconds; }

  static string Mask(string text) { return Secret.Replace(text, "$1****"); }

  static string Show(string text) {
    string shown = text.Replace("\r", "\\r").Replace("\n", "\\n");
    return shown.Length > 200 ? shown.Substring(0, 200) + "..." : shown;
  }

  void Note(string name, string value) {
    string line = string.Format("{0,-40} {1}", name, value);
    summary.Add(line);
    Console.WriteLine(string.Format("[{0,7}ms] {1}", Now(), line));
  }

  void Record(string pipe, string text) {
    lock (gate) {
      lastEventAt = Now();
      events.Add(string.Format("{0,7} {1,-3} {2}", lastEventAt, pipe, Show(Mask(text))));
      if (pipe == "in") return;
      partial.Append(text);
      string all = partial.ToString();
      int cut = all.LastIndexOf('\n');
      if (cut < 0) return;
      foreach (string raw in all.Substring(0, cut).Split('\n')) {
        string clean = Prompt.Replace(raw.Replace("\r", ""), "").Trim();
        if (clean.Length > 0) lines.Add(clean);
      }
      partial.Remove(0, cut + 1);
    }
  }

  void Reader(StreamReader reader, string pipe) {
    Thread thread = new Thread(delegate () {
      char[] buffer = new char[4096];
      int count;
      try {
        while ((count = reader.Read(buffer, 0, buffer.Length)) > 0) Record(pipe, new string(buffer, 0, count));
      } catch (Exception) { }
      Record(pipe, "<end>");
    });
    thread.IsBackground = true;
    thread.Start();
  }

  void Send(string text) {
    Record("in", text);
    proc.StandardInput.Write(text);
    proc.StandardInput.Flush();
  }

  int Markers() {
    lock (gate) {
      int count = 0;
      foreach (string line in lines) if (line == marker) count++;
      return count;
    }
  }

  long WaitMarkers(int target, int timeoutMs) {
    long start = Now();
    while (Markers() < target) {
      if (Now() - start > timeoutMs) return -1;
      Thread.Sleep(5);
    }
    return Now() - start;
  }

  void Quiet(int ms) {
    while (true) {
      long seen;
      lock (gate) seen = lastEventAt;
      Thread.Sleep(ms);
      lock (gate) if (lastEventAt == seen) return;
    }
  }

  string Took(long ms) { return ms < 0 ? "NO RESPONSE (timeout)" : ms + "ms"; }

  long Measure(string command, int timeoutMs) {
    int start = Markers();
    Send(command + "\nprint context;\n");
    return WaitMarkers(start + 1, timeoutMs);
  }

  long Local(int timeoutMs) {
    int start = Markers();
    Send("print context;\n");
    return WaitMarkers(start + 1, timeoutMs);
  }

  public void Run(string login, string query, string outPath) {
    Encoding encoding = Encoding.GetEncoding(System.Globalization.CultureInfo.CurrentCulture.TextInfo.OEMCodePage);
    ProcessStartInfo info = new ProcessStartInfo("cmd.exe", "/d /s /c \"mql -k\"");
    info.UseShellExecute = false;
    info.RedirectStandardInput = true;
    info.RedirectStandardOutput = true;
    info.RedirectStandardError = true;
    info.CreateNoWindow = true;
    info.StandardOutputEncoding = encoding;
    info.StandardErrorEncoding = encoding;
    proc = Process.Start(info);
    proc.StandardInput.NewLine = "\n";
    Reader(proc.StandardOutput, "out");
    Reader(proc.StandardError, "err");
    try {
      Thread.Sleep(3000);
      bool prompt;
      lock (gate) prompt = events.Exists(e => e.Contains("MQL<"));
      Note("encoding", encoding.WebName);
      Note("prompt MQL<n> at startup", prompt ? "yes" : "no");

      Send((login.Length > 0 ? login + "\n" : "") + "print context;\nprint context;\n");
      Thread.Sleep(500);
      Quiet(1500);
      lock (gate) {
        Dictionary<string, int> seen = new Dictionary<string, int>();
        foreach (string line in lines) seen[line] = seen.ContainsKey(line) ? seen[line] + 1 : 1;
        for (int i = lines.Count - 1; i >= 0 && marker == null; i--) if (seen[lines[i]] >= 2) marker = lines[i];
      }
      Note("marker (print context line)", marker == null ? "NOT FOUND" : Mask(marker));
      if (marker == null) return;

      Note("A1 local, no pause #1", Took(Local(30000)));
      Note("A2 local, no pause #2", Took(Local(30000)));
      Note("A3 local, no pause #3", Took(Local(30000)));
      Note("B0 query, no pause", Took(Measure(query, 90000)));
      foreach (int pause in new int[] { 3, 10, 30 }) {
        Console.WriteLine(string.Format("... waiting {0}s (idle)", pause));
        Thread.Sleep(pause * 1000);
        Note(string.Format("B{0} query after {0}s idle", pause), Took(Measure(query, 90000)));
      }
      foreach (int pause in new int[] { 10, 30 }) {
        Console.WriteLine(string.Format("... waiting {0}s (idle)", pause));
        Thread.Sleep(pause * 1000);
        Note(string.Format("C{0} local after {0}s idle", pause), Took(Local(90000)));
      }

      Console.WriteLine("... 30s with a print context every 1s (keep-alive)");
      long worst = 0;
      for (int i = 0; i < 30; i++) {
        long took = Local(30000);
        worst = Math.Max(worst, took < 0 ? 30000 : took);
        Thread.Sleep(1000);
      }
      Note("D keep-alive worst local", worst + "ms");
      Note("D query after keep-alive", Took(Measure(query, 90000)));

      int before = Markers();
      Send("pirnt bus;\nprint context;\n");
      long error = WaitMarkers(before + 1, 8000);
      Note("E error + marker in one write", error < 0 ? "marker DROPPED after error" : "marker kept, " + error + "ms");
      if (error < 0) Note("E follow-up local", Took(Local(30000)));
      Quiet(1000);

      before = Markers();
      Send(query + "\nprint context;\n");
      Thread.Sleep(30);
      Send("print context;\n");
      Thread.Sleep(30);
      Send("print context;\n");
      long ahead = WaitMarkers(before + 3, 90000);
      Note("F type-ahead (query + 2 late writes)", ahead < 0 ? (Markers() - before) + "/3 markers (late input DROPPED)" : "3/3 markers, " + ahead + "ms");
    } finally {
      try { Send("quit;\n"); } catch (Exception) { }
      Thread.Sleep(1500);
      try { Process.Start(new ProcessStartInfo("taskkill", "/pid " + proc.Id + " /t /f") { UseShellExecute = false, CreateNoWindow = true }).WaitForExit(); } catch (Exception) { }
      List<string> output = new List<string>();
      output.Add("==== SUMMARY ====");
      output.AddRange(summary);
      output.Add("");
      output.Add("==== RAW EVENTS (ms pipe text) ====");
      lock (gate) output.AddRange(events.Count > 600 ? events.GetRange(0, 600) : events);
      File.WriteAllLines(outPath, output.ToArray(), Encoding.UTF8);
      Console.WriteLine("");
      Console.WriteLine(string.Join(Environment.NewLine, summary.ToArray()));
      Console.WriteLine("");
      Console.WriteLine("saved: " + outPath);
    }
  }
}
'@

(New-Object MqlProbe).Run($Login, $Query, $Out)
